// Pure helpers over TimelineDoc — no React, no DOM, no server imports.
// Used by the client store/preview and the server filtergraph builder.

import type { AudioClip, TimelineDoc, VideoClip } from "./types";
import { MIN_CLIP_DURATION } from "./types";

/** Total duration of the timeline: end of the last clip across all tracks. */
export function docDuration(doc: TimelineDoc): number {
  let end = 0;
  for (const track of [doc.tracks.video, doc.tracks.text, doc.tracks.audio] as const) {
    for (const c of track) end = Math.max(end, c.timelineStart + c.duration);
  }
  return end;
}

/** The video clip active at timeline time t, or null (gap / past end). */
export function videoClipAt(doc: TimelineDoc, t: number): VideoClip | null {
  for (const c of doc.tracks.video) {
    if (t >= c.timelineStart && t < c.timelineStart + c.duration) return c;
  }
  return null;
}

/** The video clip that starts soonest after time t (for pre-seeking). */
export function nextVideoClipAfter(doc: TimelineDoc, t: number): VideoClip | null {
  let best: VideoClip | null = null;
  for (const c of doc.tracks.video) {
    if (c.timelineStart > t && (!best || c.timelineStart < best.timelineStart)) best = c;
  }
  return best;
}

/** The audio clip active at timeline time t, or null. */
export function audioClipAt(doc: TimelineDoc, t: number): AudioClip | null {
  for (const c of doc.tracks.audio) {
    if (t >= c.timelineStart && t < c.timelineStart + c.duration) return c;
  }
  return null;
}

/** Segments (clips + black gaps) covering [0, docDuration] of the video track. */
export type VideoSegment = { kind: "clip"; clip: VideoClip } | { kind: "gap"; duration: number };

export function videoSegments(doc: TimelineDoc): VideoSegment[] {
  const segs: VideoSegment[] = [];
  let cursor = 0;
  for (const clip of doc.tracks.video) {
    if (clip.timelineStart > cursor + 0.001) {
      segs.push({ kind: "gap", duration: clip.timelineStart - cursor });
    }
    segs.push({ kind: "clip", clip });
    cursor = clip.timelineStart + clip.duration;
  }
  // Trailing gap if text/audio outlives the video track.
  const total = docDuration(doc);
  if (total > cursor + 0.001) segs.push({ kind: "gap", duration: total - cursor });
  return segs;
}

/** Split a clip at absolute timeline time t. Returns [left, right] or null if t is not inside. */
export function splitVideoClip(clip: VideoClip, t: number, newId: string): [VideoClip, VideoClip] | null {
  const offset = t - clip.timelineStart;
  if (offset < MIN_CLIP_DURATION || clip.duration - offset < MIN_CLIP_DURATION) return null;
  const speed = clip.speed ?? 1;
  const left: VideoClip = { ...clip, duration: offset };
  const right: VideoClip = {
    ...clip,
    id: newId,
    timelineStart: t,
    duration: clip.duration - offset,
    // Source time advances speed× faster than timeline time.
    srcIn: clip.srcIn + offset * speed,
  };
  return [left, right];
}

/** Snap t to nearby clip edges / playhead within tolerance (in seconds). */
export function snapTime(t: number, candidates: number[], toleranceSec: number): number {
  let best = t;
  let bestDist = toleranceSec;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** All snap candidate times in the doc (clip edges on every track). */
export function snapCandidates(doc: TimelineDoc, excludeClipId?: string): number[] {
  const out: number[] = [0];
  for (const track of [doc.tracks.video, doc.tracks.text, doc.tracks.audio] as const) {
    for (const c of track) {
      if (c.id === excludeClipId) continue;
      out.push(c.timelineStart, c.timelineStart + c.duration);
    }
  }
  return out;
}

/**
 * Re-place a video clip after a drag: clamp into [0, ∞), sort the track, and
 * push the moved clip so it doesn't overlap its neighbours.
 */
export function placeVideoClip(track: VideoClip[], moved: VideoClip): VideoClip[] {
  const others = track.filter((c) => c.id !== moved.id).sort((a, b) => a.timelineStart - b.timelineStart);
  let start = Math.max(0, moved.timelineStart);
  for (const o of others) {
    const oEnd = o.timelineStart + o.duration;
    const overlaps = start < oEnd && start + moved.duration > o.timelineStart;
    if (overlaps) start = oEnd; // push right past this neighbour
  }
  const placed = { ...moved, timelineStart: start };
  return [...others, placed].sort((a, b) => a.timelineStart - b.timelineStart);
}
