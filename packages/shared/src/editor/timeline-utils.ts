// Pure helpers over TimelineDoc — no React, no DOM, no server imports.
// Used by the client store/preview and the server filtergraph builder.

import type { AnyClip, AudioClip, CaptionClip, CaptionWord, ImageClip, OverlayClip, TextClip, TimelineDoc, TrackKind, VideoClip } from "./timeline";
import { MIN_CLIP_DURATION } from "./timeline";

/** Total duration of the timeline: end of the last clip across all tracks. */
export function docDuration(doc: TimelineDoc): number {
  let end = 0;
  for (const track of allTracks(doc)) {
    for (const c of track) end = Math.max(end, c.timelineStart + c.duration);
  }
  return end;
}

/** Every track's clip list, overlay included (older docs may lack it). */
export function allTracks(doc: TimelineDoc): AnyClip[][] {
  const t = doc.tracks;
  return [t.video, t.text, t.audio, t.image, t.caption, t.overlay ?? []];
}

/** Whether a whole track is switched off in the track header. */
export function trackHidden(doc: TimelineDoc, kind: TrackKind): boolean {
  return doc.trackState?.[kind]?.hidden === true;
}
export function trackMuted(doc: TimelineDoc, kind: TrackKind): boolean {
  return doc.trackState?.[kind]?.muted === true;
}
export function trackLocked(doc: TimelineDoc, kind: TrackKind): boolean {
  return doc.trackState?.[kind]?.locked === true;
}

/** Overlay clips under the playhead, lowest lane first (draw order). */
export function overlayClipsAt(doc: TimelineDoc, t: number): OverlayClip[] {
  if (trackHidden(doc, "overlay")) return [];
  return (doc.tracks.overlay ?? [])
    .filter((c) => !c.hidden && t >= c.timelineStart && t < c.timelineStart + c.duration)
    .sort((a, b) => a.lane - b.lane || a.timelineStart - b.timelineStart);
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

/** Every audio clip active at timeline time t (the export mixes them all with amix). */
export function audioClipsAt(doc: TimelineDoc, t: number): AudioClip[] {
  if (trackHidden(doc, "audio") || trackMuted(doc, "audio")) return [];
  return doc.tracks.audio.filter((c) => !c.hidden && t >= c.timelineStart && t < c.timelineStart + c.duration);
}

/** Opacity multiplier from a clip's fade in/out at local time `local` —
 *  the same ramps the export's `fade` filters draw. */
export function fadeOpacityAt(local: number, duration: number, fadeIn = 0, fadeOut = 0): number {
  let o = 1;
  if (fadeIn > 0 && local < fadeIn) o = Math.min(o, local / fadeIn);
  if (fadeOut > 0 && local > duration - fadeOut) o = Math.min(o, (duration - local) / fadeOut);
  return Math.max(0, Math.min(1, o));
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
  for (const track of allTracks(doc)) {
    for (const c of track) {
      if (c.id === excludeClipId) continue;
      out.push(c.timelineStart, c.timelineStart + c.duration);
    }
  }
  for (const m of doc.markers ?? []) out.push(m.t);
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

/**
 * Re-place a caption clip after a drag — deliberately a duplicate of
 * placeVideoClip's push-past-neighbor body (not a shared generic) so the
 * working video-track code path stays completely unaffected. Captions get
 * this instead of the freeform overlap-tolerant placement text/audio/image
 * clips use, since real subtitle cues shouldn't overlap.
 */
export function placeCaptionClip(track: CaptionClip[], moved: CaptionClip): CaptionClip[] {
  const others = track.filter((c) => c.id !== moved.id).sort((a, b) => a.timelineStart - b.timelineStart);
  let start = Math.max(0, moved.timelineStart);
  for (const o of others) {
    const oEnd = o.timelineStart + o.duration;
    const overlaps = start < oEnd && start + moved.duration > o.timelineStart;
    if (overlaps) start = oEnd;
  }
  const placed = { ...moved, timelineStart: start };
  return [...others, placed].sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * Split a caption cue at absolute timeline time t. Returns [left, right] or
 * null if t isn't meaningfully inside the clip. Unlike splitVideoClip, this
 * must also partition clip.words (when present) so karaoke timing survives
 * the split — each word goes to whichever side its start falls in, and the
 * right half's words are re-baselined to its own (later) timelineStart.
 * Manually-typed cues with no words[] fall back to a text-only split: the
 * left half keeps the full text, the right half gets an empty string (no
 * word-boundary data to split on).
 */
export function splitCaptionClip(clip: CaptionClip, t: number, newId: string): [CaptionClip, CaptionClip] | null {
  const offset = t - clip.timelineStart;
  if (offset < MIN_CLIP_DURATION || clip.duration - offset < MIN_CLIP_DURATION) return null;
  const offsetMs = offset * 1000;

  if (clip.words && clip.words.length > 0) {
    const leftWords: CaptionWord[] = [];
    const rightWords: CaptionWord[] = [];
    for (const w of clip.words) {
      if (w.startMs < offsetMs) leftWords.push(w);
      else rightWords.push({ ...w, startMs: w.startMs - offsetMs, endMs: w.endMs - offsetMs });
    }
    const left: CaptionClip = { ...clip, duration: offset, text: leftWords.map((w) => w.word).join(" "), words: leftWords };
    const right: CaptionClip = {
      ...clip,
      id: newId,
      timelineStart: t,
      duration: clip.duration - offset,
      text: rightWords.map((w) => w.word).join(" "),
      words: rightWords,
    };
    return [left, right];
  }

  const left: CaptionClip = { ...clip, duration: offset };
  const right: CaptionClip = { ...clip, id: newId, timelineStart: t, duration: clip.duration - offset, text: "" };
  return [left, right];
}

/**
 * Splits a text, image, audio or overlay clip at timeline time t (Phase 1;
 * only video and captions could be split before). Source-backed clips advance
 * srcIn by the left part's length (times speed); text keyframes are shared
 * out by time, the right half's re-based to its own start.
 */
export function splitFreeClip<T extends TextClip | ImageClip | AudioClip | OverlayClip>(clip: T, t: number, newId: string): [T, T] | null {
  const offset = t - clip.timelineStart;
  if (offset < MIN_CLIP_DURATION || clip.duration - offset < MIN_CLIP_DURATION) return null;
  const left = { ...clip, duration: offset } as T;
  const right = { ...clip, id: newId, timelineStart: t, duration: clip.duration - offset } as T;
  if (clip.type === "audio" || clip.type === "overlay") {
    const speed = clip.type === "overlay" ? clip.speed ?? 1 : 1;
    (right as AudioClip | OverlayClip).srcIn = clip.srcIn + offset * speed;
    // A fade belongs to the outer edge it was set on.
    (left as AudioClip | OverlayClip).fadeOut = undefined;
    (right as AudioClip | OverlayClip).fadeIn = undefined;
  }
  if (clip.type === "image") {
    (left as ImageClip).fadeOut = undefined;
    (right as ImageClip).fadeIn = undefined;
  }
  if (clip.type === "text" && clip.keyframes?.length) {
    (left as TextClip).keyframes = clip.keyframes.filter((k) => k.t < offset);
    (right as TextClip).keyframes = clip.keyframes.filter((k) => k.t >= offset).map((k) => ({ ...k, t: k.t - offset }));
  }
  return [left, right];
}

/**
 * Closes the gap a removed main-lane span leaves (magnet on): every video
 * clip starting at or after `from` moves left by `length`.
 */
export function closeVideoGap(track: VideoClip[], from: number, length: number): VideoClip[] {
  if (length <= 0) return track;
  return track
    .map((c) => (c.timelineStart >= from - 0.001 ? { ...c, timelineStart: Math.max(0, c.timelineStart - length) } : c))
    .sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * Trims `clip` so it keeps only the part before (side "right" removed) or
 * after (side "left" removed) timeline time t — the Q/W edits. Returns the
 * patched clip, or null when t is not inside it.
 */
export function trimAtPlayhead<T extends AnyClip>(clip: T, t: number, removeSide: "left" | "right"): T | null {
  const offset = t - clip.timelineStart;
  if (offset < MIN_CLIP_DURATION || clip.duration - offset < MIN_CLIP_DURATION) return null;
  if (removeSide === "right") {
    const kept = { ...clip, duration: offset } as T;
    if (clip.type === "caption" && clip.words?.length) {
      const ms = offset * 1000;
      (kept as CaptionClip).words = clip.words.filter((w) => w.startMs < ms).map((w) => ({ ...w, endMs: Math.min(w.endMs, ms) }));
      (kept as CaptionClip).text = ((kept as CaptionClip).words ?? []).map((w) => w.word).join(" ");
    }
    if (clip.type === "text" && clip.keyframes?.length) {
      (kept as TextClip).keyframes = clip.keyframes.filter((k) => k.t < offset);
    }
    return kept;
  }
  const next = { ...clip, timelineStart: t, duration: clip.duration - offset } as T;
  if ("srcIn" in clip) {
    const speed = "speed" in clip && clip.speed ? clip.speed : 1;
    (next as T & { srcIn: number }).srcIn = clip.srcIn + offset * speed;
  }
  if (clip.type === "text" && clip.keyframes?.length) {
    (next as TextClip).keyframes = clip.keyframes.filter((k) => k.t >= offset).map((k) => ({ ...k, t: k.t - offset }));
  }
  if (clip.type === "caption" && clip.words?.length) {
    const ms = offset * 1000;
    (next as CaptionClip).words = clip.words
      .filter((w) => w.endMs > ms)
      .map((w) => ({ ...w, startMs: Math.max(0, w.startMs - ms), endMs: w.endMs - ms }));
    (next as CaptionClip).text = ((next as CaptionClip).words ?? []).map((w) => w.word).join(" ");
  }
  return next;
}

/**
 * The document as the export should see it: hidden clips (on overlay tracks)
 * and hidden tracks are dropped, muted tracks are silenced. A hidden main
 * video track keeps its timing (the frame goes black) so nothing else shifts.
 * Idempotent; the preview applies the same rules directly.
 */
export function exportView(doc: TimelineDoc): TimelineDoc {
  const t = doc.tracks;
  const hide = (k: TrackKind) => trackHidden(doc, k);
  const mute = (k: TrackKind) => trackMuted(doc, k);
  const video = t.video.map((c) => {
    if (!hide("video") && !mute("video")) return c;
    return { ...c, ...(hide("video") ? { opacity: 0 } : {}), ...(mute("video") ? { muted: true } : {}) };
  });
  return {
    ...doc,
    trackState: undefined,
    tracks: {
      video,
      text: hide("text") ? [] : t.text.filter((c) => !c.hidden),
      image: hide("image") ? [] : t.image.filter((c) => !c.hidden),
      caption: hide("caption") ? [] : t.caption.filter((c) => !c.hidden),
      audio: hide("audio") || mute("audio") ? [] : t.audio.filter((c) => !c.hidden),
      overlay: hide("overlay")
        ? []
        : (t.overlay ?? []).filter((c) => !c.hidden).map((c) => (mute("overlay") ? { ...c, muted: true } : c)),
    },
  };
}
