// One Gemini JSON call, shared by the AutoClip AI stages (edit plan, B-roll
// ranking, scene vision). Same models and overload fallback as the clip pick
// (lib/autoclip-pipeline.ts), so a saturated 2.5 Flash degrades to Flash-Lite
// here too, and every answer is validated with zod before anything uses it —
// a model that drifts off-schema produces "no decision", never a bad render.

import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import type { z } from "zod";
import { env } from "@/lib/env";
import { generateWithOverloadFallback } from "@/lib/gemini-overload";
import { logger } from "@/lib/logger";

export const AI_PRIMARY_MODEL = "gemini-2.5-flash";
export const AI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

export function geminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/** Pull the first JSON object or array out of a model answer. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/[[{][\s\S]*[\]}]/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

/**
 * Ask for JSON and validate it. Returns null on any failure (no key, timeout,
 * overload on both models, unparseable or off-schema answer) — callers treat
 * null as "skip this AI step".
 */
export async function geminiJson<S extends z.ZodTypeAny>(args: {
  label: string;
  parts: (string | Part)[];
  schema: S;
  timeoutMs?: number;
  temperature?: number;
}): Promise<z.infer<S> | null> {
  if (!env.GEMINI_API_KEY) return null;
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  try {
    const result = await generateWithOverloadFallback({
      call: (name, signal) => genAI
        .getGenerativeModel({
          model: name,
          generationConfig: { responseMimeType: "application/json", temperature: args.temperature ?? 0.4 },
        })
        .generateContent(args.parts, { signal }),
      primary: AI_PRIMARY_MODEL,
      fallback: AI_FALLBACK_MODEL,
      timeoutMs: args.timeoutMs ?? 45_000,
      // These steps are optional: one short retry, not the pick's 46s ladder.
      primaryBackoffMs: [3_000],
      fallbackBackoffMs: [3_000],
      onFallback: () => logger.warn("autoclip-ai", `${args.label}: ${AI_PRIMARY_MODEL} busy, using ${AI_FALLBACK_MODEL}`),
    });
    const parsed = args.schema.safeParse(extractJson(result.response.text()));
    if (!parsed.success) {
      logger.warn("autoclip-ai", `${args.label}: answer did not match the schema`, { issue: parsed.error.issues[0]?.message });
      return null;
    }
    return parsed.data;
  } catch (err) {
    logger.warn("autoclip-ai", `${args.label}: Gemini call failed, skipping`, err);
    return null;
  }
}
