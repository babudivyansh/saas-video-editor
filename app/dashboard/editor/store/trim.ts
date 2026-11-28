// Edge-trim maths for timeline clips (pure — the store applies the patch).
//
// Limits a trim enforces:
//  • video and caption tracks never overlap (validateDoc rejects an
//    overlapping doc on save, so an unclamped trim broke autosave);
//  • a video/audio clip can't start before second 0 of its source
//    (srcIn ≥ 0) or run past the end of its source, when that length is known;
//  • every clip keeps at least MIN_CLIP_DURATION.
// A left trim also moves what's anchored to the clip start — caption word
// timings and text keyframes — so they stay where they were on the timeline.

import type { AnyClip, CaptionClip, TextClip, TrackKind, VideoClip } from "@/lib/editor/types";
import { MIN_CLIP_DURATION } from "@/lib/editor/types";

const EPS = 0.001;

export function trimPatch(
  track: TrackKind,
  clip: AnyClip,
  list: AnyClip[],
  edge: "left" | "right",
  newTime: number,
  sourceLength?: number,
): Partial<AnyClip> {
  const start = clip.timelineStart;
  const end = start + clip.duration;
  const exclusive = track === "video" || track === "caption";
  const hasSource = clip.type === "video" || clip.type === "audio" || clip.type === "overlay";
  const speed = clip.type === "video" || clip.type === "overlay" ? (clip.speed ?? 1) : 1;
  const srcIn = hasSource ? (clip as VideoClip).srcIn : 0;

  if (edge === "left") {
    let lo = 0;
    if (exclusive) {
      for (const o of list) {
        if (o.id === clip.id) continue;
        const oEnd = o.timelineStart + o.duration;
        if (oEnd <= start + EPS) lo = Math.max(lo, oEnd);
      }
    }
    if (hasSource) lo = Math.max(lo, start - srcIn / speed);
    const hi = end - MIN_CLIP_DURATION;
    const newStart = Math.min(Math.max(newTime, lo), hi);
    const delta = newStart - start;
    const duration = end - newStart;
    const patch: Partial<AnyClip> = { timelineStart: newStart, duration };
    if (hasSource) (patch as Partial<VideoClip>).srcIn = Math.max(0, srcIn + delta * speed);
    if (clip.type === "caption" && clip.words?.length) {
      const shiftMs = delta * 1000;
      const durMs = duration * 1000;
      const words = clip.words
        .map((w) => ({ ...w, startMs: Math.max(0, w.startMs - shiftMs), endMs: w.endMs - shiftMs }))
        .filter((w) => w.endMs > 0 && w.startMs < durMs);
      (patch as Partial<CaptionClip>).words = words;
      (patch as Partial<CaptionClip>).text = words.map((w) => w.word).join(" ");
    }
    if (clip.type === "text" && clip.keyframes?.length) {
      (patch as Partial<TextClip>).keyframes = clip.keyframes
        .map((k) => ({ ...k, t: k.t - delta }))
        .filter((k) => k.t >= 0 && k.t <= duration + EPS);
    }
    return patch;
  }

  let hi = Infinity;
  if (exclusive) {
    for (const o of list) {
      if (o.id === clip.id) continue;
      if (o.timelineStart >= end - EPS) hi = Math.min(hi, o.timelineStart);
    }
  }
  if (hasSource && sourceLength && sourceLength > srcIn) hi = Math.min(hi, start + (sourceLength - srcIn) / speed);
  const lo = start + MIN_CLIP_DURATION;
  const newEnd = Math.max(Math.min(newTime, hi), lo);
  return { duration: newEnd - start };
}

/**
 * Sorts the video and caption tracks and pushes any clip that overlaps the one
 * before it to that clip's end. Projects saved before trims were clamped can
 * hold overlaps, which the export refuses ("video clips overlap"); loading
 * them through this makes them exportable again. Returns the same doc when
 * nothing needed fixing.
 */
export function repairOverlaps<T extends { tracks: { video: VideoClip[]; caption: CaptionClip[] } }>(doc: T): T {
  const fix = <C extends AnyClip>(track: C[]): C[] | null => {
    const sorted = [...track].sort((a, b) => a.timelineStart - b.timelineStart);
    let changed = sorted.some((c, i) => c !== track[i]);
    let cursor = 0;
    const out = sorted.map((c) => {
      if (c.timelineStart < cursor - EPS) {
        changed = true;
        c = { ...c, timelineStart: cursor };
      }
      cursor = c.timelineStart + c.duration;
      return c;
    });
    return changed ? out : null;
  };
  const video = fix(doc.tracks.video);
  const caption = fix(doc.tracks.caption);
  if (!video && !caption) return doc;
  return { ...doc, tracks: { ...doc.tracks, video: video ?? doc.tracks.video, caption: caption ?? doc.tracks.caption } };
}

export const TIMING_KEYS = ["timelineStart", "duration", "srcIn", "speed"] as const;

/**
 * Same limits as a drag, for a clip whose timing was typed in (properties
 * panel Start / Duration / Trim in / Speed). `next` already has the patch
 * applied. A moved video or caption clip is pushed past any clip it would
 * overlap (the drag behaviour); a longer duration stops at the next clip and
 * at the end of the source.
 */
export function constrainTiming(
  track: TrackKind,
  prev: AnyClip,
  next: AnyClip,
  list: AnyClip[],
  sourceLength?: number,
): AnyClip {
  const out = { ...next } as AnyClip;
  out.timelineStart = Math.max(0, out.timelineStart);
  const hasSource = out.type === "video" || out.type === "audio" || out.type === "overlay";
  if (hasSource) {
    const c = out as VideoClip;
    const speed = out.type === "video" || out.type === "overlay" ? (c.speed ?? 1) : 1;
    c.srcIn = Math.max(0, c.srcIn);
    if (sourceLength) {
      c.srcIn = Math.min(c.srcIn, Math.max(0, sourceLength - MIN_CLIP_DURATION * speed));
      out.duration = Math.min(out.duration, (sourceLength - c.srcIn) / speed);
    }
  }
  out.duration = Math.max(MIN_CLIP_DURATION, out.duration);
  if ((track === "video" || track === "caption") && out.timelineStart === prev.timelineStart) {
    // Only the length changed: stop at the next clip rather than overlap it.
    let hi = Infinity;
    for (const o of list) {
      if (o.id !== out.id && o.timelineStart >= prev.timelineStart + EPS) hi = Math.min(hi, o.timelineStart);
    }
    out.duration = Math.max(MIN_CLIP_DURATION, Math.min(out.duration, hi - out.timelineStart));
  }
  return out;
}
