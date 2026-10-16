// How loud a music clip is at any moment: its volume, faded in/out, and dipped
// under speech when "lower music when someone talks" is on. One source of
// truth for the live preview (musicGainAt) and the export (musicVolumeFilter).
// Speech comes from the captions' word timings — no extra analysis needed.
// Pure and client-safe.

import { computeDuckEnvelope, duckVolumeExpr, type DuckSegment } from "@/lib/audio-ducking";
import type { AudioClip, TimelineDoc } from "./types";
import type { TimeRange } from "./ripple-cut";

export const DEFAULT_DUCK_LEVEL = 0.3;

/** Timeline spans where someone is speaking, from caption word timings. */
export function speechRangesFromCaptions(doc: TimelineDoc): TimeRange[] {
  const out: TimeRange[] = [];
  for (const c of doc.tracks.caption) {
    if (c.hidden) continue;
    if (c.words && c.words.length > 0) {
      for (const w of c.words) out.push({ start: c.timelineStart + w.startMs / 1000, end: c.timelineStart + w.endMs / 1000 });
    } else if (c.text.trim()) {
      out.push({ start: c.timelineStart, end: c.timelineStart + c.duration });
    }
  }
  return out;
}

/** The clip's duck envelope in CLIP-LOCAL seconds (0 = clip start), as gain multipliers. */
export function clipDuckSegments(clip: AudioClip, speech: TimeRange[]): DuckSegment[] {
  if (!clip.duck || speech.length === 0) return [];
  const local = speech
    .map((r) => ({ start: r.start - clip.timelineStart, end: r.end - clip.timelineStart }))
    .filter((r) => r.end > 0 && r.start < clip.duration);
  return computeDuckEnvelope(local, clip.duration, { duckGain: clip.duckLevel ?? DEFAULT_DUCK_LEVEL, fullGain: 1 });
}

function fadeGain(clip: AudioClip, local: number): number {
  let g = 1;
  const fi = clip.fadeIn ?? 0;
  const fo = clip.fadeOut ?? 0;
  if (fi > 0 && local < fi) g = Math.min(g, Math.max(0, local / fi));
  if (fo > 0 && local > clip.duration - fo) g = Math.min(g, Math.max(0, (clip.duration - local) / fo));
  return g;
}

/** Preview: the clip's level (0..1) at timeline time t. */
export function musicGainAt(clip: AudioClip, t: number, segments: DuckSegment[]): number {
  const local = t - clip.timelineStart;
  if (local < 0 || local > clip.duration) return 0;
  const duck = segments.find((s) => local >= s.start && local < s.end)?.gain ?? 1;
  return Math.max(0, Math.min(1, clip.volume * duck * fadeGain(clip, local)));
}

/**
 * Export: the ffmpeg filters (after atrim/asetpts, before adelay, so `t` is
 * clip-local) that give the same result as musicGainAt.
 */
export function musicVolumeFilter(clip: AudioClip, segments: DuckSegment[], num: (n: number) => string | number = (n) => Math.round(n * 1000) / 1000): string {
  const parts = [`volume=${num(clip.volume)}`];
  if (segments.length > 0) parts.push(`volume='${duckVolumeExpr(segments, 1)}':eval=frame`);
  const fi = clip.fadeIn ?? 0;
  const fo = clip.fadeOut ?? 0;
  if (fi > 0) parts.push(`afade=t=in:st=0:d=${num(fi)}`);
  if (fo > 0) parts.push(`afade=t=out:st=${num(Math.max(0, clip.duration - fo))}:d=${num(fo)}`);
  return parts.join(",");
}
