// The one place the Social Tracker talks to Gemini.
//
// Every generator goes through `generateStructured`, which gives all of them the
// same three guarantees:
//   1. JSON mode with a response schema derived from the caller's zod schema, so
//      the model is constrained at generation time as well as validated after.
//   2. The house retry/timeout wrapper, with the AbortSignal actually threaded
//      into the SDK call so a hung request is cancelled rather than abandoned.
//   3. zod validation of the reply. A reply that does not match is an error, not
//      a "best effort" result — the routes refund the credit on the throw.
//
// The prompt preamble lives here too, because "use only these numbers" is not a
// per-generator nicety: it is the invariant that makes an LLM safe to point at
// an analytics product at all.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/with-retry";
import { renderFactsheet, type Factsheet } from "./factsheets";

export const AI_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 25_000;

export class AiValidationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiValidationError";
  }
}

/**
 * The instruction block every social prompt starts with.
 *
 * Kept verbatim from the original insights prompt — it has been in production
 * and it is the sentence doing the actual work.
 */
export const GROUNDING_PREAMBLE = `Use ONLY the numbers in the FACTS block below — never invent, extrapolate, or recompute figures. If a value is "unknown" or a metric is listed as not reported, do not mention it and do not estimate it. Write in plain language, no emoji, no hashtag spam.`;

export interface StructuredPrompt {
  /** The role line, e.g. "You are a social media growth coach." */
  role: string;
  /** What to produce. Describes the shape in words; the schema enforces it. */
  task: string;
  facts: Factsheet;
}

export function buildPrompt(p: StructuredPrompt): string {
  return [
    p.role,
    "",
    GROUNDING_PREAMBLE,
    "",
    "FACTS:",
    renderFactsheet(p.facts),
    "",
    "TASK:",
    p.task,
    "",
    "Return ONLY valid JSON matching the required schema. No markdown fences.",
  ].join("\n");
}

/** JSON Schema keys the Gemini SDK rejects outright. */
const UNSUPPORTED_KEYS = new Set(["$schema", "additionalProperties", "$ref", "definitions", "$defs"]);

/**
 * zod → the schema dialect Gemini's `responseSchema` accepts.
 *
 * It takes a strict subset of JSON Schema: no `$schema`, no `additionalProperties`,
 * no `$ref`. Nullable fields arrive from zod as `anyOf: [T, {type:"null"}]`, which
 * Gemini also rejects, so they are flattened to `T` plus `nullable: true`.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node === null || typeof node !== "object") return node;

  const input = node as Record<string, unknown>;

  // anyOf/oneOf with a null branch is zod's `.nullable()`.
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = input[key];
    if (!Array.isArray(branches)) continue;
    const nonNull = branches.filter(
      (b) => !(b !== null && typeof b === "object" && (b as Record<string, unknown>).type === "null"),
    );
    if (nonNull.length === 1) {
      return { ...(toGeminiSchema(nonNull[0]) as object), nullable: true };
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;
    out[key] = toGeminiSchema(value);
  }
  return out;
}

export interface GenerateOptions<T> {
  schema: z.ZodType<T>;
  /** The JSON Schema form of `schema`, from z.toJSONSchema — passed in so the
   *  conversion is done once at module scope by the caller, not per request. */
  responseSchema: unknown;
  prompt: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

/** Models occasionally fence JSON despite being asked not to. */
function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
}

export async function generateStructured<T>(opts: GenerateOptions<T>): Promise<T> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: AI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      // Cast: the SDK's ResponseSchema type is narrower than the JSON Schema
      // subset it actually accepts at runtime.
      responseSchema: toGeminiSchema(opts.responseSchema) as never,
    },
  });

  const result = await withRetry((signal) => model.generateContent(opts.prompt, { signal }), {
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(opts.maxAttempts ? { maxAttempts: opts.maxAttempts } : {}),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(result.response.text()));
  } catch (e) {
    throw new AiValidationError("model returned text that is not JSON", e);
  }

  const validated = opts.schema.safeParse(parsed);
  if (!validated.success) {
    // The most common failure is a metric name that is not in METRIC_KEYS —
    // i.e. exactly the hallucination the schema exists to catch.
    throw new AiValidationError(
      `model reply failed schema validation: ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      validated.error,
    );
  }
  return validated.data;
}
