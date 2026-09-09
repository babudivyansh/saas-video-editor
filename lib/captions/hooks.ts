// Hook-title generation.
//
// The strategic point of this file (§15): the HOOK TEXT IS CLIPIRO'S. A hook is
// an editorial judgement about what makes someone stop scrolling — it is the
// same class of intelligence as picking the viral moment in the first place,
// and it is exactly the kind of thing that must not be outsourced to whoever
// happens to render the captions. The provider is told a string and animates
// it; it is never asked what the string should be.
//
// That also keeps hooks working when the provider is off: the text still gets
// generated, stored and shown, and the native renderer can draw it later
// without any of this changing.
//
// Same Gemini + withRetry + strict-JSON shape as lib/caption-translate.ts.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/with-retry";
import type { WordTiming } from "@/utils/elevenlabs";

/** Hard cap. Long hooks wrap into a wall of text and stop being hooks. */
export const MAX_HOOK_CHARS = 60;
const CANDIDATE_COUNT = 3;
/** Enough transcript to judge the payoff without paying for the whole clip. */
const TRANSCRIPT_CHAR_BUDGET = 4000;

export interface HookCandidate {
  text: string;
}

function transcriptText(words: WordTiming[]): string {
  return words
    .map((w) => w.word)
    .join(" ")
    .slice(0, TRANSCRIPT_CHAR_BUDGET);
}

/**
 * Cleans a model-produced hook.
 *
 * Exported and pure so the rules are testable without a network call — the
 * model is instructed to follow all of them, and does not reliably.
 */
export function normalizeHook(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[\r\n]+/g, " ")
    // Models love wrapping a "quoted hook" even when told not to.
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_HOOK_CHARS);
  return text.length >= 3 ? text : null;
}

/**
 * Generates hook candidates for a clip. The USER picks or edits one — this
 * never auto-applies, because a confidently wrong hook is worse than none.
 *
 * Returns [] rather than throwing on any failure: a hook is an enhancement, and
 * losing it must never fail a render. Callers treat [] as "offer the manual
 * text box", which is the same thing they do when the feature is disabled.
 */
export async function generateHookCandidates(
  words: WordTiming[],
  opts: { title?: string | null } = {},
): Promise<HookCandidate[]> {
  if (words.length === 0) return [];
  if (!env.GEMINI_API_KEY) return [];

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You write opening hook titles for short-form vertical video.

A hook is the line burned over the first seconds of the clip. It has to make
someone stop scrolling before they have heard a word.

Rules:
- Return ONLY a JSON array of ${CANDIDATE_COUNT} strings. No prose, no markdown fences.
- Each hook is at most ${MAX_HOOK_CHARS} characters.
- Base them on what is ACTUALLY said in the transcript. Do not invent claims,
  numbers, names or outcomes that are not there.
- No hashtags, no emoji, no surrounding quotes.
- Vary the angle across the three: one curiosity gap, one bold claim the clip
  genuinely supports, one direct question.
${opts.title ? `\nThe clip's working title: ${opts.title}\n` : ""}
Transcript:
${transcriptText(words)}`;

  try {
    const result = await withRetry((signal) => model.generateContent(prompt, { signal }), {
      timeoutMs: 30_000,
      maxAttempts: 2,
    });
    const raw = result.response.text().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const out: HookCandidate[] = [];
    for (const item of parsed) {
      const text = normalizeHook(item);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text });
      if (out.length >= CANDIDATE_COUNT) break;
    }
    return out;
  } catch (err) {
    logger.warn("captions", "hook generation failed — falling back to no suggestions");
    void err;
    return [];
  }
}
