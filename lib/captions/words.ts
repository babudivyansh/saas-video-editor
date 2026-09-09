// Transcript translation between Clipiro's canonical model and a provider's.
//
// THE RULE THIS FILE ENFORCES (§11): Clip.transcriptJson stays canonical. The
// provider's transcript is an input to reconcile against, never a replacement.
// So the only lossy direction is Clipiro -> provider; coming back, provider
// tokens are folded into our shape and anything we already knew and the
// provider doesn't model (speaker labels, most obviously) survives untouched.
//
// UNITS: everything here is MILLISECONDS on both sides. WordTiming is ms
// (utils/elevenlabs.ts) and CaptionWord is ms (lib/captions/types.ts). Clip
// columns are seconds, but no clip column is touched in this file — that
// conversion happens once, at the call site, on purpose.

import { sanitizeCaptionWord } from "@/lib/caption-sanitize";
import type { CaptionWord, CaptionWordType } from "./types";
import type { WordTiming } from "@/utils/elevenlabs";

/** Bounds a hostile or broken provider payload. Matches transcriptSchema's cap. */
export const MAX_CAPTION_WORDS = 20_000;

const PUNCT_ONLY = /^[\p{P}\p{S}]+$/u;

function inferType(text: string, declared?: string): CaptionWordType {
  const d = (declared ?? "").toLowerCase();
  if (d === "punctuation" || d === "silence" || d === "word") return d;
  if (text.trim() === "") return "silence";
  if (PUNCT_ONLY.test(text.trim())) return "punctuation";
  return "word";
}

function finiteMs(...candidates: (number | undefined)[]): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) return c;
  }
  return null;
}

/**
 * Provider words -> Clipiro CaptionWord[].
 *
 * Defensive because the provider's exact word shape is unverified: it accepts
 * `text` or `word`, `startTime`/`endTime` or `start`/`end`, tolerates a missing
 * `type`, drops tokens with no usable timing rather than inventing one, and
 * re-sorts chronologically (§12 "preserve chronological timing") because a
 * provider is under no obligation to return them in order after an edit.
 */
export function fromProviderWords(
  raw: { id?: string; text?: string; word?: string; type?: string; startTime?: number; endTime?: number; start?: number; end?: number }[] | undefined,
): CaptionWord[] {
  if (!Array.isArray(raw)) return [];

  const out: CaptionWord[] = [];
  for (const w of raw.slice(0, MAX_CAPTION_WORDS)) {
    const text = sanitizeCaptionWord(String(w.text ?? w.word ?? ""));
    const start = finiteMs(w.startTime, w.start);
    const end = finiteMs(w.endTime, w.end);
    // A token with no timing can't be rendered or re-aligned; skipping beats
    // fabricating a timestamp that would desynchronise everything after it.
    if (start === null || end === null) continue;
    const type = inferType(text, w.type);
    if (type !== "silence" && text === "") continue;
    out.push({
      ...(w.id ? { id: String(w.id).slice(0, 128) } : {}),
      text,
      type,
      startTime: start,
      endTime: Math.max(start, end),
    });
  }

  out.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  return out;
}

/** Clipiro CaptionWord[] -> the provider's word array. */
export function toProviderWords(words: CaptionWord[]): {
  id?: string;
  text: string;
  type: CaptionWordType;
  startTime: number;
  endTime: number;
}[] {
  return words.slice(0, MAX_CAPTION_WORDS).map((w) => ({
    ...(w.id ? { id: w.id } : {}),
    text: w.text,
    type: w.type,
    startTime: Math.round(w.startTime),
    endTime: Math.round(w.endTime),
  }));
}

// ── Bridging to Clipiro's canonical transcript ──────────────────────────────

/**
 * Clip.transcriptJson (WordTiming[]) -> CaptionWord[].
 *
 * Our transcript has no punctuation or silence tokens — it is spoken words with
 * timings — so everything produced here is type "word". Speaker labels are
 * dropped on the way out because no provider models them; `mergeProviderWords`
 * puts them back rather than losing them.
 */
export function fromWordTimings(words: WordTiming[] | null | undefined): CaptionWord[] {
  if (!Array.isArray(words)) return [];
  return words.slice(0, MAX_CAPTION_WORDS).map((w) => ({
    text: sanitizeCaptionWord(w.word ?? ""),
    type: "word" as const,
    startTime: w.start,
    endTime: w.end,
  }));
}

/**
 * CaptionWord[] -> WordTiming[], for writing back to Clip.transcriptJson.
 *
 * Punctuation is APPENDED to the preceding word rather than kept as its own
 * token, and silences are dropped: WordTiming feeds the ASS renderer, where a
 * standalone "," would be laid out and highlighted as if it were a spoken word.
 * Leading punctuation with nothing to attach to becomes its own token, which is
 * the only case where that's the right answer.
 */
export function toWordTimings(words: CaptionWord[]): WordTiming[] {
  const out: WordTiming[] = [];
  for (const w of words) {
    if (w.type === "silence") continue;
    if (w.type === "punctuation") {
      const prev = out[out.length - 1];
      if (prev) {
        prev.word = sanitizeCaptionWord(prev.word + w.text);
        prev.end = Math.max(prev.end, w.endTime);
        continue;
      }
    }
    if (w.text === "") continue;
    out.push({ word: w.text, start: Math.round(w.startTime), end: Math.round(Math.max(w.startTime, w.endTime)) });
  }
  return out;
}

/**
 * Reconciles a provider transcript against ours (§11).
 *
 * Clipiro's transcript wins on content and on speaker labels — it is the
 * canonical record and may already carry user corrections. The provider's
 * contribution is its token structure (punctuation, silence) and its ids, which
 * are what a later `updateTranscript` needs to address existing tokens.
 *
 * Matching is positional over spoken words only, which is correct for the one
 * case that matters: the provider transcribed the same audio we did, so the
 * spoken-word sequence is the same even where punctuation differs. When the
 * counts diverge we keep OUR words and simply don't attach ids, rather than
 * guessing an alignment — a wrong alignment would silently retime captions.
 */
export function mergeProviderWords(canonical: WordTiming[], provider: CaptionWord[]): CaptionWord[] {
  const ours = fromWordTimings(canonical);
  const providerSpoken = provider.filter((w) => w.type === "word");

  if (ours.length === 0) return provider;
  if (providerSpoken.length !== ours.length) return ours;

  return ours.map((w, i) => ({
    ...w,
    ...(providerSpoken[i].id ? { id: providerSpoken[i].id } : {}),
  }));
}
