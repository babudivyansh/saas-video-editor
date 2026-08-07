// Translate a clip's word-level transcript.
//
// This logic already existed, buried inside lib/autoclip-dub.ts, where it only
// ran as a side effect of generating dubbed audio. So a user who wanted
// Spanish subtitles had to pay for a Spanish voice track they did not want.
// Extracted here so captions can be translated on their own, and so the dub
// path and the caption path can't drift apart in how they do it.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { CAPTION_LANGUAGES, captionLanguageName } from "@/lib/languages";
import type { WordTiming } from "@/utils/elevenlabs";

// Translating everything in one request loses timing fidelity on long clips
// and risks a truncated response; batching keeps each request small enough to
// stay accurate while preserving the original timestamps exactly.
const BATCH_SIZE = 120;

export function isSupportedCaptionLanguage(code: string): boolean {
  return CAPTION_LANGUAGES.some((l) => l.code === code);
}

/**
 * Translate word timings into `targetLang`, preserving the timeline.
 *
 * Word counts rarely survive translation — languages differ in how many words
 * express the same idea — so the model is asked to redistribute the target
 * text across the SAME time span rather than to map word-for-word. The span is
 * then re-imposed here, because a model that drifts on timestamps would
 * desync every caption after the drift.
 */
export async function translateTranscript(words: WordTiming[], targetLang: string): Promise<WordTiming[]> {
  if (words.length === 0) return [];
  if (!env.GEMINI_API_KEY) throw new Error("Translation is not configured on this server");

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const targetLangName = captionLanguageName(targetLang);

  const out: WordTiming[] = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const spanStart = batch[0].start;
    const spanEnd = batch[batch.length - 1].end;

    const prompt = `Translate this spoken transcript into ${targetLangName} for use as video subtitles.

Rules:
- Return ONLY a JSON array of {"word": string, "start": number, "end": number}. No prose, no markdown fences.
- Timestamps are milliseconds and must stay within ${spanStart} and ${spanEnd}, ascending, non-overlapping.
- The number of words may differ from the input — translate naturally, then spread the result evenly across the same time span.
- Keep proper nouns, numbers and units unchanged.

Input:
${JSON.stringify(batch.map((w) => ({ word: w.word, start: w.start, end: w.end })))}`;

    try {
      const result = await withRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 45_000 });
      const match = result.response.text().trim().match(/\[[\s\S]*\]/);
      if (!match) throw new Error("no JSON array in translation response");
      const parsed = JSON.parse(match[0]) as WordTiming[];
      out.push(...normaliseSpan(parsed, spanStart, spanEnd));
    } catch (err) {
      // A failed batch keeps the ORIGINAL words rather than dropping that
      // stretch of the clip: partially-translated captions are far better than
      // a silent gap where the speaker is clearly talking.
      logger.warn("caption-translate", `batch ${i}-${i + batch.length} failed, keeping source text`, err);
      out.push(...batch);
    }
  }
  return out;
}

/**
 * Force a translated batch back inside its original time span, in order.
 * The model is asked to respect the span; this makes it true regardless.
 */
export function normaliseSpan(words: WordTiming[], spanStart: number, spanEnd: number): WordTiming[] {
  const clean = words
    .filter((w) => typeof w?.word === "string" && w.word.trim().length > 0)
    .map((w) => ({ word: String(w.word).trim(), start: Number(w.start), end: Number(w.end) }));
  if (clean.length === 0) return [];

  const span = Math.max(1, spanEnd - spanStart);
  const usable = clean.every((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    && clean.every((w, i) => i === 0 || w.start >= clean[i - 1].start);

  // Trust the model's timings when they're coherent; otherwise distribute
  // evenly, which is still perfectly readable as subtitles.
  if (usable) {
    return clean.map((w) => ({
      word: w.word,
      start: Math.min(spanEnd, Math.max(spanStart, w.start)),
      end: Math.min(spanEnd, Math.max(spanStart + 1, w.end)),
    }));
  }

  const per = span / clean.length;
  return clean.map((w, i) => ({
    word: w.word,
    start: Math.round(spanStart + i * per),
    end: Math.round(spanStart + (i + 1) * per),
  }));
}
