import {
  MIN_CLIP_DURATION,
  docDuration,
  splitCaptionClip,
  splitVideoClip,
  type AnyClip,
  type CaptionClip,
  type CaptionHighlightMode,
  type EffectPreset,
  type FilterPreset,
  type TextClip,
  type TimelineDoc,
  type TrackKind,
  type TransitionPreset,
  type VideoClip,
} from "@clipiro/shared";

// Edits on the web editor's timeline document (packages/shared
// editor/timeline.ts), as pure functions: each takes a doc and returns a new
// one that still passes validateDoc. The phone's timeline is magnetic on the
// video track — deleting, trimming or duplicating a clip closes or opens the
// gap so the video plays straight through — while overlays (text, captions,
// audio, images) keep their own times.

export type Selection = { track: TrackKind; id: string };

let n = 0;
/** A fresh clip id (uuid-shaped enough for the doc; the web uses randomUUID). */
export const newId = () => `m${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const round = (t: number) => Math.round(t * 1000) / 1000;

/** Lays the video clips end to end from 0, in their current order. */
export function closeVideoGaps(video: VideoClip[]): VideoClip[] {
  let t = 0;
  return [...video]
    .sort((a, b) => a.timelineStart - b.timelineStart)
    .map((c) => {
      const placed = { ...c, timelineStart: round(t) };
      t += c.duration;
      return placed;
    });
}

const withVideo = (doc: TimelineDoc, video: VideoClip[]): TimelineDoc => ({ ...doc, tracks: { ...doc.tracks, video: closeVideoGaps(video) } });

export function findClip(doc: TimelineDoc, sel: Selection | null): AnyClip | null {
  if (!sel) return null;
  return (doc.tracks[sel.track] as AnyClip[]).find((c) => c.id === sel.id) ?? null;
}

/**
 * Splits the selected clip (video or caption) at time t, or the video clip
 * under t when nothing splittable is selected. Null when t is at an edge.
 */
export function split(doc: TimelineDoc, t: number, sel: Selection | null): { doc: TimelineDoc; selected: Selection } | null {
  if (sel?.track === "caption") {
    const c = doc.tracks.caption.find((x) => x.id === sel.id);
    const parts = c && splitCaptionClip(c, t, newId());
    if (!c || !parts) return null;
    const caption = doc.tracks.caption.flatMap((x) => (x.id === c.id ? parts : [x]));
    return { doc: { ...doc, tracks: { ...doc.tracks, caption } }, selected: { track: "caption", id: parts[1].id } };
  }
  const target = sel?.track === "video" ? doc.tracks.video.find((x) => x.id === sel.id) : doc.tracks.video.find((c) => t >= c.timelineStart && t < c.timelineStart + c.duration);
  const parts = target && splitVideoClip(target, t, newId());
  if (!target || !parts) return null;
  return { doc: withVideo(doc, doc.tracks.video.flatMap((x) => (x.id === target.id ? parts : [x]))), selected: { track: "video", id: parts[1].id } };
}

/** A copy right after the clip (video: the rest of the track moves along; overlays: same lane, just after). */
export function duplicate(doc: TimelineDoc, sel: Selection): { doc: TimelineDoc; selected: Selection } | null {
  const c = findClip(doc, sel);
  if (!c) return null;
  const copy = { ...c, id: newId(), timelineStart: round(c.timelineStart + c.duration) } as AnyClip;
  if (sel.track === "video") {
    const video = doc.tracks.video.flatMap((x) => (x.id === c.id ? [x, copy as VideoClip] : [x]));
    // Everything after the original shifts by the copy's length before re-laying.
    return { doc: withVideo(doc, video.map((x, i) => ({ ...x, timelineStart: i }))), selected: { track: "video", id: copy.id } };
  }
  if (sel.track === "caption") {
    // Cues can't overlap: the copy goes after the last cue that starts at or after the original's end.
    const caption = [...doc.tracks.caption, { ...(copy as CaptionClip), timelineStart: round(Math.max(copy.timelineStart, ...doc.tracks.caption.map((x) => x.timelineStart + x.duration))) }];
    return { doc: { ...doc, tracks: { ...doc.tracks, caption } }, selected: { track: "caption", id: copy.id } };
  }
  const track = [...(doc.tracks[sel.track] as AnyClip[]), copy];
  return { doc: { ...doc, tracks: { ...doc.tracks, [sel.track]: track } }, selected: { track: sel.track, id: copy.id } };
}

/** Removes the clip; on the video track the clips after it close up. */
export function remove(doc: TimelineDoc, sel: Selection): TimelineDoc {
  if (sel.track === "video") return withVideo(doc, doc.tracks.video.filter((c) => c.id !== sel.id));
  return { ...doc, tracks: { ...doc.tracks, [sel.track]: (doc.tracks[sel.track] as AnyClip[]).filter((c) => c.id !== sel.id) } };
}

/**
 * Trims a video clip's start or end by `delta` seconds (positive = shorter
 * from that side), within its source file (`sourceLength`, unknown = no
 * limit on the far side). The track closes up after it.
 */
export function trimVideo(doc: TimelineDoc, id: string, edge: "start" | "end", delta: number, sourceLength: number | null): TimelineDoc {
  const video = doc.tracks.video.map((c) => {
    if (c.id !== id) return c;
    const speed = c.speed ?? 1;
    if (edge === "start") {
      // Can't trim before the source's first frame, nor below the minimum.
      const d = Math.min(Math.max(delta, -c.srcIn / speed), c.duration - MIN_CLIP_DURATION * 4);
      return { ...c, srcIn: round(c.srcIn + d * speed), duration: round(c.duration - d) };
    }
    const room = sourceLength == null ? Infinity : (sourceLength - c.srcIn) / speed - c.duration;
    const d = Math.max(Math.min(delta, c.duration - MIN_CLIP_DURATION * 4), -room);
    return { ...c, duration: round(c.duration - d) };
  });
  return withVideo(doc, video);
}

/** Moves a video clip one place earlier or later. */
export function moveVideo(doc: TimelineDoc, id: string, dir: -1 | 1): TimelineDoc {
  const video = [...doc.tracks.video];
  const i = video.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= video.length) return doc;
  [video[i], video[j]] = [video[j]!, video[i]!];
  return withVideo(doc, video.map((c, k) => ({ ...c, timelineStart: k })));
}

/** Sets a look on one video clip, or all of them. */
export function setLook(doc: TimelineDoc, ids: string[] | "all", look: { filter?: FilterPreset; effect?: EffectPreset; transitionOut?: TransitionPreset }): TimelineDoc {
  const video = doc.tracks.video.map((c) => (ids === "all" || ids.includes(c.id) ? { ...c, ...look } : c));
  return { ...doc, tracks: { ...doc.tracks, video } };
}

/** The original sound of every video clip, 0–1. */
export function setOriginalVolume(doc: TimelineDoc, volume: number): TimelineDoc {
  const video = doc.tracks.video.map((c) => ({ ...c, volume, muted: volume === 0 }));
  return { ...doc, tracks: { ...doc.tracks, video } };
}

export function setClipVolume(doc: TimelineDoc, track: "audio" | "video", id: string, volume: number): TimelineDoc {
  const list = (doc.tracks[track] as AnyClip[]).map((c) => (c.id === id ? { ...c, volume, ...(track === "video" ? { muted: volume === 0 } : {}) } : c));
  return { ...doc, tracks: { ...doc.tracks, [track]: list } };
}

/** Caption look shared by every cue (the panel styles them together, as the web's caption style does). */
export type CaptionStyle = Partial<Pick<CaptionClip, "fontFamily" | "fontSizePct" | "color" | "bold" | "highlightMode" | "highlightColor" | "textTransform" | "x" | "y" | "positionPreset" | "strokeColor" | "strokeWidthPct" | "bgColor">>;

export function styleCaptions(doc: TimelineDoc, style: CaptionStyle): TimelineDoc {
  // A cue without word timings can't highlight word by word.
  const caption = doc.tracks.caption.map((c) => ({ ...c, ...style, ...(style.highlightMode && !c.words?.length ? { highlightMode: "none" as CaptionHighlightMode } : {}) }));
  return { ...doc, tracks: { ...doc.tracks, caption } };
}

/** Where top / center / bottom put a caption (the web's presets, with its default safe margin). */
export function captionPosition(preset: "top" | "center" | "bottom"): { x: number; y: number; positionPreset: "top" | "center" | "bottom" } {
  return { x: 0.5, y: preset === "top" ? 0.15 : preset === "center" ? 0.5 : 0.8, positionPreset: preset };
}

/** A text overlay at time t, three seconds long (or to the end of the video). */
export function addText(doc: TimelineDoc, t: number, text: Omit<TextClip, "id" | "type" | "timelineStart" | "duration">): { doc: TimelineDoc; selected: Selection } {
  const end = Math.max(docDuration(doc), t + 3);
  const clip: TextClip = { ...text, id: newId(), type: "text", timelineStart: round(t), duration: round(Math.min(3, end - t)) };
  return { doc: { ...doc, tracks: { ...doc.tracks, text: [...doc.tracks.text, clip] } }, selected: { track: "text", id: clip.id } };
}

export function updateClip<T extends AnyClip>(doc: TimelineDoc, track: TrackKind, id: string, patch: Partial<T>): TimelineDoc {
  return { ...doc, tracks: { ...doc.tracks, [track]: (doc.tracks[track] as AnyClip[]).map((c) => (c.id === id ? { ...c, ...patch } : c)) } };
}
