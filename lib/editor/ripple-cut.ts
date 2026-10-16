// Cutting time ranges out of the whole timeline ("ripple delete"): every
// track loses the cut span and everything after it slides left, so nothing
// drifts out of sync. Used to cut filler words and silences from the video.
// Pure and client-safe.

import { MIN_CLIP_DURATION, type AnyClip, type CaptionClip, type TimelineDoc, type TrackKind } from "./types";
import { FILLER_PHRASES } from "./ai-text";

export interface TimeRange { start: number; end: number }

/** Sorted, merged, non-empty ranges. */
export function normalizeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((r) => r.end - r.start > 0.001).map((r) => ({ ...r })).sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.001) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

function captionWithout(clip: CaptionClip, fromMs: number, toMs: number): CaptionClip {
  // Whole milliseconds: (1.3 - 1) * 1000 is 300.00000000000006, which would miss a word at 300.
  const cutFromMs = Math.round(fromMs);
  const cutToMs = Math.round(toMs);
  if (!clip.words || clip.words.length === 0) return clip;
  const len = cutToMs - cutFromMs;
  const words = clip.words
    .filter((w) => !(w.startMs >= cutFromMs && w.startMs < cutToMs))
    .map((w) => (w.startMs >= cutToMs ? { ...w, startMs: w.startMs - len, endMs: w.endMs - len } : { ...w, endMs: Math.min(w.endMs, cutFromMs) }));
  return { ...clip, words, text: words.map((w) => w.word).join(" ") };
}

function cutOne(clip: AnyClip, a: number, b: number, newId: () => string): AnyClip[] {
  const len = b - a;
  const s = clip.timelineStart;
  const e = s + clip.duration;
  if (e <= a) return [clip];
  if (s >= b) return [{ ...clip, timelineStart: s - len }];
  if (s >= a && e <= b) return [];

  const speed = clip.type === "video" ? clip.speed ?? 1 : 1;

  if (s < a && e > b) {
    // The cut is inside the clip.
    if (clip.type === "video" || clip.type === "audio") {
      const left = { ...clip, duration: a - s };
      const right = { ...clip, id: newId(), timelineStart: a, duration: e - b, srcIn: clip.srcIn + (b - s) * speed };
      return [left, right] as AnyClip[];
    }
    if (clip.type === "caption") {
      const cut = captionWithout(clip, (a - s) * 1000, (b - s) * 1000);
      return [{ ...cut, duration: clip.duration - len }];
    }
    return [{ ...clip, duration: clip.duration - len }];
  }

  if (s < a) {
    // The cut takes the clip's tail.
    const keep = a - s;
    if (clip.type === "caption") return [{ ...captionWithout(clip, keep * 1000, clip.duration * 1000), duration: keep }];
    return [{ ...clip, duration: keep }];
  }

  // The cut takes the clip's head (a <= s < b < e).
  const lost = b - s;
  if (clip.type === "video" || clip.type === "audio") {
    return [{ ...clip, timelineStart: a, duration: e - b, srcIn: clip.srcIn + lost * speed } as AnyClip];
  }
  if (clip.type === "caption") {
    const cut = captionWithout(clip, 0, lost * 1000);
    return [{ ...cut, timelineStart: a, duration: e - b }];
  }
  return [{ ...clip, timelineStart: a, duration: e - b }];
}

const TRACKS: TrackKind[] = ["video", "text", "audio", "image", "caption"];

/** Removes `ranges` (timeline seconds) from every track and closes the gaps. */
export function rippleCut(doc: TimelineDoc, ranges: TimeRange[], newId: () => string): TimelineDoc {
  const cuts = normalizeRanges(ranges).reverse(); // latest first, so earlier cuts' positions stay valid
  const tracks = { ...doc.tracks };
  for (const k of TRACKS) {
    let list = tracks[k] as AnyClip[];
    for (const { start, end } of cuts) list = list.flatMap((c) => cutOne(c, start, end, newId));
    list = list.filter((c) => c.duration >= MIN_CLIP_DURATION).sort((x, y) => x.timelineStart - y.timelineStart);
    (tracks as Record<TrackKind, AnyClip[]>)[k] = list;
  }
  return { ...doc, tracks };
}

export interface FillerHit { captionId: string; text: string; start: number; end: number }

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, "").trim();

/** Filler words in captions that have word timings, with their timeline span. */
export function findFillerWords(doc: TimelineDoc): FillerHit[] {
  const phrases = [...FILLER_PHRASES].map(norm).filter(Boolean).sort((a, b) => b.split(" ").length - a.split(" ").length);
  const hits: FillerHit[] = [];
  for (const c of doc.tracks.caption) {
    if (c.hidden || !c.words?.length) continue;
    const words = c.words;
    for (let i = 0; i < words.length; ) {
      let matched = 0;
      for (const p of phrases) {
        const n = p.split(" ").length;
        if (i + n > words.length) continue;
        if (norm(words.slice(i, i + n).map((w) => w.word).join(" ")) === p) { matched = n; break; }
      }
      if (matched > 0) {
        const first = words[i];
        const last = words[i + matched - 1];
        hits.push({
          captionId: c.id,
          text: words.slice(i, i + matched).map((w) => w.word).join(" "),
          start: c.timelineStart + first.startMs / 1000,
          end: c.timelineStart + last.endMs / 1000,
        });
        i += matched;
      } else i++;
    }
  }
  return hits;
}
