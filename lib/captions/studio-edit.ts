// Caption Studio's edits to a project's captions, as pure functions over the
// editor doc: change one word (text, timing, style), split or merge lines,
// delete a line, find and replace, style every copy of a word. Client-safe.
//
// Cue times are timeline seconds; word times are ms from their cue's start
// (CaptionWord). Every function keeps cue.text equal to its words joined, so
// the editor and the SRT export read the same text the Studio shows.

import type { CaptionClip, CaptionWord, TimelineDoc } from "@/lib/editor/types";
import { newClipId } from "@/lib/editor/caption-generation";
import type { CaptionWordStyle } from "@clipiro/shared/caption-style";

/** Shortest a word may last, so a nudged word never disappears. */
export const MIN_WORD_MS = 40;

type Cues = CaptionClip[];

function withCues(doc: TimelineDoc, caption: Cues): TimelineDoc {
  return { ...doc, tracks: { ...doc.tracks, caption } };
}

function textOf(words: CaptionWord[]): string {
  return words.map((w) => w.word).join(" ");
}

function mapCue(doc: TimelineDoc, cueId: string, fn: (cue: CaptionClip) => CaptionClip): TimelineDoc {
  return withCues(doc, doc.tracks.caption.map((c) => (c.id === cueId ? fn(c) : c)));
}

/** A style with empty fields dropped; undefined when nothing is left. */
export function cleanStyle(style: CaptionWordStyle | undefined): CaptionWordStyle | undefined {
  if (!style) return undefined;
  const out: CaptionWordStyle = {};
  if (style.color) out.color = style.color;
  if (style.emphasis) out.emphasis = style.emphasis;
  if (style.emoji) out.emoji = style.emoji;
  return Object.keys(out).length ? out : undefined;
}

export interface WordPatch {
  word?: string;
  /** Merged into the word's style; a field set to undefined is cleared. */
  style?: Partial<CaptionWordStyle>;
  startMs?: number;
  endMs?: number;
}

/**
 * Changes one word. Timing is clamped inside the cue and between its
 * neighbours; an emptied word is removed (an empty caption word reads as a
 * gap in the line).
 */
export function updateWord(doc: TimelineDoc, cueId: string, index: number, patch: WordPatch): TimelineDoc {
  return mapCue(doc, cueId, (cue) => {
    const words = [...(cue.words ?? [])];
    const w = words[index];
    if (!w) return cue;
    const next: CaptionWord = { ...w };
    if (patch.word !== undefined) next.word = patch.word.trim().replace(/\s+/g, " ");
    if (patch.style) {
      const style = cleanStyle({ ...w.style, ...patch.style });
      if (style) next.style = style;
      else delete next.style;
    }
    const cueMs = cue.duration * 1000;
    const lo = index > 0 ? words[index - 1]!.endMs : 0;
    const hi = index < words.length - 1 ? words[index + 1]!.startMs : cueMs;
    if (patch.startMs !== undefined) next.startMs = Math.round(Math.min(Math.max(patch.startMs, lo), next.endMs - MIN_WORD_MS));
    if (patch.endMs !== undefined) next.endMs = Math.round(Math.max(Math.min(patch.endMs, hi), next.startMs + MIN_WORD_MS));
    if (!next.word) words.splice(index, 1);
    else words[index] = next;
    return { ...cue, words, text: textOf(words) };
  });
}

/**
 * Splits a line before word `index`: the new line starts where that word
 * starts. Index 0 or past the end changes nothing.
 */
export function splitCue(doc: TimelineDoc, cueId: string, index: number): TimelineDoc {
  const list = doc.tracks.caption;
  const at = list.findIndex((c) => c.id === cueId);
  const cue = list[at];
  const words = cue?.words ?? [];
  if (!cue || index <= 0 || index >= words.length) return doc;
  const cutMs = words[index]!.startMs;
  const first: CaptionClip = { ...cue, words: words.slice(0, index), text: textOf(words.slice(0, index)), duration: cutMs / 1000 };
  const restWords = words.slice(index).map((w) => ({ ...w, startMs: w.startMs - cutMs, endMs: w.endMs - cutMs }));
  const second: CaptionClip = {
    ...cue,
    id: newClipId(),
    timelineStart: cue.timelineStart + cutMs / 1000,
    duration: cue.duration - cutMs / 1000,
    words: restWords,
    text: textOf(restWords),
  };
  return withCues(doc, [...list.slice(0, at), first, second, ...list.slice(at + 1)]);
}

/** Joins a line with the one after it, across any gap between them. */
export function mergeWithNext(doc: TimelineDoc, cueId: string): TimelineDoc {
  const list = doc.tracks.caption;
  const at = list.findIndex((c) => c.id === cueId);
  const a = list[at];
  const b = list[at + 1];
  if (!a || !b) return doc;
  const offsetMs = Math.round((b.timelineStart - a.timelineStart) * 1000);
  const words = [...(a.words ?? []), ...(b.words ?? []).map((w) => ({ ...w, startMs: w.startMs + offsetMs, endMs: w.endMs + offsetMs }))];
  const merged: CaptionClip = { ...a, words, text: textOf(words), duration: b.timelineStart + b.duration - a.timelineStart };
  return withCues(doc, [...list.slice(0, at), merged, ...list.slice(at + 2)]);
}

export function deleteCue(doc: TimelineDoc, cueId: string): TimelineDoc {
  return withCues(doc, doc.tracks.caption.filter((c) => c.id !== cueId));
}

function wordMatcher(find: string, matchCase: boolean): (word: string) => boolean {
  const strip = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const target = matchCase ? strip(find) : strip(find).toLocaleLowerCase();
  return (word) => target.length > 0 && (matchCase ? strip(word) : strip(word).toLocaleLowerCase()) === target;
}

/** How many words match `find` (whole word, punctuation ignored). */
export function countMatches(doc: TimelineDoc, find: string, matchCase = false): number {
  const is = wordMatcher(find, matchCase);
  return doc.tracks.caption.reduce((n, c) => n + (c.words ?? []).filter((w) => is(w.word)).length, 0);
}

/**
 * Replaces every whole-word `find` with `replace`, keeping each word's
 * punctuation, timing and style ("clipero," → "Clipiro,").
 */
export function replaceAll(doc: TimelineDoc, find: string, replace: string, matchCase = false): { doc: TimelineDoc; count: number } {
  const is = wordMatcher(find, matchCase);
  const to = replace.trim();
  let count = 0;
  const caption = doc.tracks.caption.map((c) => {
    if (!c.words?.some((w) => is(w.word))) return c;
    const words = c.words.map((w) => {
      if (!is(w.word)) return w;
      count++;
      const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(w.word);
      return { ...w, word: `${m?.[1] ?? ""}${to}${m?.[3] ?? ""}`.trim() };
    }).filter((w) => w.word);
    return { ...c, words, text: textOf(words) };
  });
  return { doc: withCues(doc, caption), count };
}

/** Gives every copy of `word` the same style change ("Apply to all"). */
export function styleMatching(doc: TimelineDoc, word: string, style: Partial<CaptionWordStyle>): { doc: TimelineDoc; count: number } {
  const is = wordMatcher(word, false);
  let count = 0;
  const caption = doc.tracks.caption.map((c) => {
    if (!c.words?.some((w) => is(w.word))) return c;
    return {
      ...c,
      words: c.words.map((w) => {
        if (!is(w.word)) return w;
        count++;
        const s = cleanStyle({ ...w.style, ...style });
        const { style: _old, ...rest } = w;
        return s ? { ...rest, style: s } : rest;
      }),
    };
  });
  return { doc: withCues(doc, caption), count };
}

/** The cue (and word, if any) being spoken at a timeline time in ms. */
export function cueAt(doc: TimelineDoc, ms: number): { cueId: string; index: number } | null {
  const cue = doc.tracks.caption.find((c) => ms >= c.timelineStart * 1000 && ms < (c.timelineStart + c.duration) * 1000);
  if (!cue) return null;
  const local = ms - cue.timelineStart * 1000;
  const index = (cue.words ?? []).findIndex((w) => local >= w.startMs && local < w.endMs);
  return { cueId: cue.id, index };
}
