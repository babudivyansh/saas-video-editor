// Text-based editing engine: maps transcript word ranges → timeline cuts and
// removes/ripples those ranges from a TrackDoc. Pure functions (no store/React)
// so they're easy to test and reuse from the panel + agentic copilot (Phase 3).

import type { TrackDoc, Clip, CaptionSegment } from "@/lib/track-editor-types";
import { uid } from "@/lib/track-editor-types";

export interface TimeRange { start: number; end: number } // seconds, timeline

// Common English filler words (single-token). Normalized lowercase, punctuation stripped.
const FILLERS = new Set([
  "um", "umm", "uh", "uhh", "uhm", "er", "err", "ah", "ahh", "hmm", "mm",
  "like", "actually", "basically", "literally", "honestly", "right",
]);

function norm(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const valid = ranges.filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of valid) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.001) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// Total cut duration strictly before timeline time `t` (for the ripple shift).
function cutBefore(t: number, merged: TimeRange[]): number {
  let sum = 0;
  for (const r of merged) {
    if (r.end <= t) sum += r.end - r.start;
    else if (r.start < t) sum += t - r.start;
  }
  return sum;
}

const speedOf = (clip: Clip) => (clip.data.kind === "video" ? (clip.data.speed || 1) : 1);

// Remove timeline ranges from every track and ripple the remaining clips left so
// there are no gaps. Splits clips that straddle a cut boundary.
export function removeTimeRanges(doc: TrackDoc, ranges: TimeRange[]): TrackDoc {
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return doc;

  const tracks = doc.tracks.map(track => {
    const clips: Clip[] = [];
    for (const clip of track.clips) {
      const cStart = clip.start;
      const cEnd = clip.start + clip.duration;
      // Surviving sub-intervals = [cStart,cEnd) minus the merged cut ranges.
      let segs: [number, number][] = [[cStart, cEnd]];
      for (const r of merged) {
        segs = segs.flatMap(([a, b]): [number, number][] => {
          if (r.end <= a || r.start >= b) return [[a, b]];
          const out: [number, number][] = [];
          if (r.start > a) out.push([a, Math.min(r.start, b)]);
          if (r.end < b) out.push([Math.max(r.end, a), b]);
          return out;
        });
      }
      const sp = speedOf(clip);
      for (const [a, b] of segs) {
        if (b - a < 0.03) continue; // drop slivers
        const offsetIntoClip = a - cStart;       // timeline seconds into the clip
        const srcInNew = clip.srcIn + offsetIntoClip * sp;
        const newStart = a - cutBefore(a, merged); // ripple left
        clips.push({
          ...clip,
          id: uid(),
          start: Math.max(0, newStart),
          duration: b - a,
          srcIn: srcInNew,
          srcOut: srcInNew + (b - a) * sp,
        });
      }
    }
    return { ...track, clips };
  });

  return { ...doc, tracks };
}

// Map a source-time range (seconds in the original media) to a timeline range,
// using a clip's own placement (start, srcIn, speed). Returns null if outside.
export function sourceRangeToTimeline(clip: Clip, srcStart: number, srcEnd: number): TimeRange | null {
  const sp = speedOf(clip);
  const srcClipEnd = clip.srcOut;
  const s = Math.max(srcStart, clip.srcIn);
  const e = Math.min(srcEnd, srcClipEnd);
  if (e <= s) return null;
  const tlStart = clip.start + (s - clip.srcIn) / sp;
  const tlEnd = clip.start + (e - clip.srcIn) / sp;
  return { start: tlStart, end: tlEnd };
}

// ── Detection (operate on word segments; times are ms in source media) ────────

export function detectFillerRanges(segments: CaptionSegment[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const seg of segments) {
    if (FILLERS.has(norm(seg.word))) out.push({ start: seg.start / 1000, end: seg.end / 1000 });
  }
  return out;
}

// Gaps between consecutive words longer than `minGapSec` become cuts. Keep a
// little padding so speech onsets/tails aren't clipped.
export function detectSilenceRanges(segments: CaptionSegment[], minGapSec = 0.7, padSec = 0.12): TimeRange[] {
  const out: TimeRange[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const gapStart = segments[i].end / 1000;
    const gapEnd = segments[i + 1].start / 1000;
    if (gapEnd - gapStart > minGapSec) {
      const s = gapStart + padSec;
      const e = gapEnd - padSec;
      if (e > s) out.push({ start: s, end: e });
    }
  }
  return out;
}

export const isFiller = (word: string) => FILLERS.has(norm(word));

// ── Clip helpers (shared by the transcript panel + agentic copilot) ───────────

// The first video clip in the timeline = the "main" media we transcribe + edit.
export function mainVideoClip(doc: TrackDoc): Clip | null {
  for (const t of doc.tracks) {
    if (t.kind !== "video") continue;
    const c = t.clips.find(c => c.data.kind === "video");
    if (c) return c;
  }
  return null;
}

// Map a source-time range to timeline ranges across ALL current video clips, so
// deletes still resolve correctly after earlier cuts split the source.
export function srcRangeToTimelineAll(doc: TrackDoc, srcStart: number, srcEnd: number): TimeRange[] {
  const out: TimeRange[] = [];
  for (const t of doc.tracks) {
    if (t.kind !== "video") continue;
    for (const c of t.clips) {
      if (c.data.kind !== "video") continue;
      const r = sourceRangeToTimeline(c, srcStart, srcEnd);
      if (r) out.push(r);
    }
  }
  return out;
}
