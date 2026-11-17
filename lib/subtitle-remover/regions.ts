// Pure geometry for the Subtitle Remover's local (ffmpeg delogo) modes: reading
// OCR boxes, turning per-frame detections into caption bands, validating the
// boxes a user draws, and building the delogo filter. No I/O, so it is unit
// tested on its own (regions.test.ts).

export interface Box { x: number; y: number; w: number; h: number }
export interface Detection extends Box { t: number }
/** A box to patch, in pixels. No start/end = the whole video. */
export interface PatchRegion extends Box { startSec?: number; endSec?: number }
export interface FrameSize { w: number; h: number }

/** "Bottom third": only text whose centre is below this fraction of the height counts as a caption. */
export const BOTTOM_AREA_FROM = 0.55;
/** More bands than this and they are merged into one, never silently dropped. */
export const MAX_BANDS = 12;
/** Most boxes a user may draw. */
export const MAX_USER_REGIONS = 4;
/** delogo refuses boxes smaller than this after clamping. */
const MIN_SIDE = 4;

/**
 * Florence-2 OCR-with-region output (`results.quad_boxes`: `{x, y, w, h}` in
 * pixels of the image sent). Parsed defensively: never throws.
 */
export function parseOcrRegions(raw: unknown): Box[] {
  const results = (raw as { results?: { quad_boxes?: unknown[] } } | null | undefined)?.results;
  const boxes = results?.quad_boxes;
  if (!Array.isArray(boxes)) return [];
  return boxes
    .filter((b): b is Box =>
      !!b && typeof b === "object" &&
      ["x", "y", "w", "h"].every((k) => Number.isFinite((b as Record<string, unknown>)[k])))
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
    .filter((b) => b.w > 0 && b.h > 0);
}

/**
 * Fits a box inside the frame the way ffmpeg's delogo needs it: at least one
 * pixel clear of EVERY edge. delogo rebuilds the box from the pixels around
 * it, so a box touching x=0 or the right/bottom edge fails the whole encode
 * with "Logo area is outside of the frame". Returns null when too little is
 * left to patch.
 */
export function clampToFrame(b: Box, frame: FrameSize): Box | null {
  const x0 = Math.max(1, Math.round(b.x));
  const y0 = Math.max(1, Math.round(b.y));
  const x1 = Math.min(frame.w - 1, Math.round(b.x + b.w));
  const y1 = Math.min(frame.h - 1, Math.round(b.y + b.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < MIN_SIDE || h < MIN_SIDE) return null;
  return { x: x0, y: y0, w, h };
}

/** Frame sampling for OCR: 2 fps for short videos, else this many frames spread evenly. */
export const SAMPLE_FRAME_CAP = 150;
export function sampleFpsFor(durationSec: number): number {
  return durationSec * 2 > SAMPLE_FRAME_CAP ? SAMPLE_FRAME_CAP / durationSec : 2;
}

/**
 * Turns per-frame text detections into caption BANDS for "bottom third" mode.
 *
 * Subtitle lines change every few seconds and differ in width, so grouping by
 * box overlap (the old approach) made a new group per line and then dropped
 * all but 8 of them, leaving most captions on screen. Captions sit at one
 * height, though, so detections that share a vertical band are one band; it
 * spans from the first to the last time text was seen there, bridging the
 * gaps between samples (a line shown between two samples is still covered).
 */
export function captionBands(detections: Detection[], frame: FrameSize, intervalSec: number): PatchRegion[] {
  const inBottom = detections.filter((d) => d.y + d.h / 2 >= frame.h * BOTTOM_AREA_FROM);
  const sorted = [...inBottom].sort((a, b) => a.t - b.t);
  const maxGap = Math.max(intervalSec * 2.5, 6);
  const bands: Array<{ x0: number; y0: number; x1: number; y1: number; start: number; end: number }> = [];

  for (const d of sorted) {
    const match = bands.find((b) => {
      const overlap = Math.min(b.y1, d.y + d.h) - Math.max(b.y0, d.y);
      return d.t - b.end <= maxGap && overlap >= 0.5 * Math.min(b.y1 - b.y0, d.h);
    });
    if (match) {
      match.x0 = Math.min(match.x0, d.x); match.x1 = Math.max(match.x1, d.x + d.w);
      match.y0 = Math.min(match.y0, d.y); match.y1 = Math.max(match.y1, d.y + d.h);
      match.end = d.t;
    } else {
      bands.push({ x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h, start: d.t, end: d.t });
    }
  }

  let merged = bands;
  if (merged.length > MAX_BANDS) {
    merged = [merged.reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
      start: Math.min(a.start, b.start), end: Math.max(a.end, b.end),
    }))];
  }

  // Pad in time (text may appear just before/after a sample) and in space
  // (OCR boxes hug the glyphs; outlines and shadows sit outside them).
  const padT = intervalSec * 0.75;
  const out: PatchRegion[] = [];
  for (const b of merged) {
    const padY = Math.max(4, Math.round((b.y1 - b.y0) * 0.2));
    const padX = Math.max(4, Math.round(frame.w * 0.02));
    const box = clampToFrame({ x: b.x0 - padX, y: b.y0 - padY, w: b.x1 - b.x0 + 2 * padX, h: b.y1 - b.y0 + 2 * padY }, frame);
    if (!box) continue;
    out.push({ ...box, startSec: Math.max(0, b.start - padT), endSec: b.end + padT });
  }
  return out;
}

/**
 * Boxes a user drew, as fractions of the displayed frame (0..1). Returns null
 * for anything malformed: never more than MAX_USER_REGIONS, never empty.
 */
export function parseUserRegions(raw: unknown): Box[] | null {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_USER_REGIONS) return null;
  const out: Box[] = [];
  for (const r of value) {
    if (!r || typeof r !== "object") return null;
    const { x, y, w, h } = r as Record<string, unknown>;
    if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    const b = { x: x as number, y: y as number, w: w as number, h: h as number };
    if (b.x < 0 || b.y < 0 || b.w < 0.01 || b.h < 0.01 || b.x + b.w > 1.0001 || b.y + b.h > 1.0001) return null;
    out.push(b);
  }
  return out;
}

/** User boxes (fractions) to pixel patch regions covering the whole video. */
export function userRegionsToPatches(regions: Box[], frame: FrameSize): PatchRegion[] {
  return regions
    .map((r) => clampToFrame({ x: r.x * frame.w, y: r.y * frame.h, w: r.w * frame.w, h: r.h * frame.h }, frame))
    .filter((b): b is Box => b !== null);
}

/** One delogo per region, time-limited when the region has a range. */
export function buildDelogoFilter(regions: PatchRegion[]): string | null {
  if (regions.length === 0) return null;
  return regions
    .map((r) => {
      const base = `delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:show=0`;
      return r.startSec != null && r.endSec != null
        ? `${base}:enable='between(t,${r.startSec.toFixed(2)},${r.endSec.toFixed(2)})'`
        : base;
    })
    .join(",");
}

/** Width and height from a PNG's IHDR chunk, or null if it isn't a PNG. */
export function pngSize(buf: Uint8Array): FrameSize | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || sig.some((v, i) => buf[i] !== v)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  return w > 0 && h > 0 ? { w, h } : null;
}
