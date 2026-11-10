import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EDIT_MODELS, DEFAULT_EDIT_MODEL_ID, type EditModelEntry } from "@/lib/models/editModels";

// The Auto router: one Gemini text call that picks the edit model for an
// instruction, rewrites the instruction into the form edit models follow best,
// and screens it for policy. Costs ~$0.0005 and is never billed.
//
// Auto only routes between base-price models (autoEligible), so what Auto
// costs is known before the call: the UI quotes it without asking the router.
// If Gemini fails or is slow, a keyword fallback picks instead and the
// instruction is sent as the user wrote it.

export interface RouteInput {
  prompt: string;
  /** Extra reference images besides the photo being edited. */
  referenceCount: number;
  /** Auto-eligible model ids this user's plan allows. */
  allowedModelIds: string[];
}

export interface RouteDecision {
  modelId: string;
  prompt: string;
  blocked: boolean;
  reason: string;
  via: "gemini" | "fallback";
}

const TEXT_EDIT = /\b(text|word|words|title|caption|headline|sign|signage|label|logo text|letters|font|typo|spelling|say|says|written|writing)\b|["“”'‘’].+["“”'‘’]/i;
const STYLE_EDIT = /\b(style|styled|anime|cartoon|ghibli|pixar|watercolou?r|oil painting|sketch|comic|cinematic|vintage|retro|film look|relight|lighting|golden hour|sunset light|night time|nighttime|turn (it|this) into|make it look like|aesthetic)\b/i;

function pick(allowed: string[], ...preferred: string[]): string {
  for (const id of preferred) if (allowed.includes(id)) return id;
  return allowed.includes(DEFAULT_EDIT_MODEL_ID) ? DEFAULT_EDIT_MODEL_ID : allowed[0] ?? DEFAULT_EDIT_MODEL_ID;
}

/** Keyword routing: the fallback when the Gemini call fails, and the rules it is asked to follow. */
export function heuristicRoute(input: RouteInput): string {
  const { prompt, referenceCount, allowedModelIds: allowed } = input;
  if (referenceCount >= 3) return pick(allowed, "edit-seedream-5");
  if (referenceCount > 0) return pick(allowed, "edit-seedream-5", "edit-gemini-flash");
  if (TEXT_EDIT.test(prompt)) return pick(allowed, "edit-qwen-2");
  if (STYLE_EDIT.test(prompt)) return pick(allowed, "edit-flux-kontext");
  return pick(allowed, "edit-gemini-flash");
}

function modelCatalogue(models: EditModelEntry[]): string {
  return models.map((m) => `- ${m.id}: ${m.bestFor}. Up to ${m.maxImages} input image(s).`).join("\n");
}

const SYSTEM = `You route photo-editing instructions for Clipiro, a creator app. The user uploaded a photo and typed an instruction.
Return JSON only: {"model": string, "prompt": string, "blocked": boolean, "reason": string}.

model: pick exactly one id from the list you are given.
- Changing or adding words, titles or signs in the image: the text model.
- Restyling, relighting, changing time of day or turning the photo into an art style: the style model.
- Combining the photo with reference images, or product placement: the multi-image model.
- Everything else, especially edits to people where faces must stay the same: the default Gemini model.

prompt: rewrite the instruction as one clear English editing instruction, at most 80 words. Keep every specific detail the user gave (colours, positions, objects). Copy any quoted text exactly, in its original language and spelling. End with "Keep everything else unchanged." unless the user asked for a full restyle. Never add content the user did not ask for.

blocked: true if the instruction asks for any of: nudity or sexual content, making a real person look sexual, harm or gore involving real people, putting a real public figure into a fake compromising or deceptive scene, forging documents, IDs, money or official seals, or removing a watermark from someone else's work. Otherwise false. reason: one short sentence when blocked, else "".`;

export async function routeEdit(input: RouteInput, opts?: { timeoutMs?: number }): Promise<RouteDecision> {
  const fallback = (): RouteDecision => ({
    modelId: heuristicRoute(input),
    prompt: input.prompt,
    blocked: false,
    reason: "",
    via: "fallback",
  });

  const models = EDIT_MODELS.filter((m) => m.autoEligible && input.allowedModelIds.includes(m.id));
  if (models.length <= 1 || !env.GEMINI_API_KEY) return fallback();

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 400 },
    });
    const user = `Models you may pick:\n${modelCatalogue(models)}\n\nReference images besides the photo: ${input.referenceCount}\n\nInstruction:\n${input.prompt}`;
    const res = await model.generateContent(
      { contents: [{ role: "user", parts: [{ text: user }] }] },
      { timeout: opts?.timeoutMs ?? 8000 },
    );
    const parsed = JSON.parse(res.response.text()) as Partial<{ model: unknown; prompt: unknown; blocked: unknown; reason: unknown }>;

    if (parsed.blocked === true) {
      return { modelId: heuristicRoute(input), prompt: input.prompt, blocked: true, reason: typeof parsed.reason === "string" ? parsed.reason : "", via: "gemini" };
    }
    const id = typeof parsed.model === "string" && models.some((m) => m.id === parsed.model) ? parsed.model : heuristicRoute(input);
    // A model that can't take this many images would fail the call: the
    // fallback rules always pick one that can.
    const entry = models.find((m) => m.id === id);
    const modelId = entry && entry.maxImages >= input.referenceCount + 1 ? id : heuristicRoute(input);
    const rewritten = typeof parsed.prompt === "string" && parsed.prompt.trim() ? parsed.prompt.trim().slice(0, 1500) : input.prompt;
    return { modelId, prompt: rewritten, blocked: false, reason: "", via: "gemini" };
  } catch (err) {
    logger.warn("photo-edit", "router fell back to keywords", err);
    return fallback();
  }
}
