// "Match colours": turns two clips' measured colour stats into the Fine-tune
// (VideoAdjust) that makes the first look like the second. Stats come from
// ffmpeg signalstats (8-bit YUV averages over sampled frames, measured AFTER
// each clip's filter preset — and the reference's own fine-tune — so the
// match is against what the viewer actually sees). Pure and client-safe.
//
// The model mirrors what adjustFilters() renders, calibrated against ffmpeg:
//   eq contrast c pivots luma on 128 and scales the 10–90% spread by c;
//   eq brightness b adds b·255 to luma; eq saturation s scales SATAVG by s;
//   colorbalance midtones at warmth w moves (V − U) by ≈ WARMTH_UNIT·w.

import { NEUTRAL_ADJUST, type VideoAdjust } from "./types";

export interface ColorStats {
  /** Average luma, 0–255. */
  y: number;
  /** Luma spread between the 10th and 90th percentiles (YHIGH − YLOW). */
  spread: number;
  /** Average saturation (signalstats SATAVG). */
  sat: number;
  /** Average U and V (128 = neutral). */
  u: number;
  v: number;
}

/** Change in (V − U) per +1 warmth, measured with colorbalance midtones (k = 0.15·w). */
export const WARMTH_UNIT = 16.4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const step = (n: number, s: number) => Math.round(n / s) * s;
const tidy = (n: number) => Math.round(n * 1000) / 1000;

export function matchAdjust(src: ColorStats, ref: ColorStats): VideoAdjust {
  // Contrast first: brightness and colour both depend on it.
  const contrast = src.spread < 4 ? 1 : clamp(step(ref.spread / src.spread, 0.01), 0.5, 1.5);
  const brightness = clamp(step((ref.y - 128 - (src.y - 128) * contrast) / 255, 0.01), -0.3, 0.3);
  // A near-grey clip has no colour to scale; leave saturation alone.
  const saturation = src.sat < 2 ? 1 : clamp(step(ref.sat / src.sat, 0.01), 0, 2);
  // Warmth goes after saturation in the chain, which scales the existing tint.
  const srcTint = (src.v - src.u) * saturation;
  const warmth = clamp(step((ref.v - ref.u - srcTint) / WARMTH_UNIT, 0.05), -1, 1);
  return {
    brightness: tidy(brightness),
    contrast: tidy(contrast),
    saturation: tidy(saturation),
    warmth: tidy(warmth) || NEUTRAL_ADJUST.warmth,
  };
}

/** Averages per-frame stats; null when nothing was measured. */
export function averageStats(frames: ColorStats[]): ColorStats | null {
  if (frames.length === 0) return null;
  const sum = frames.reduce((a, f) => ({ y: a.y + f.y, spread: a.spread + f.spread, sat: a.sat + f.sat, u: a.u + f.u, v: a.v + f.v }), {
    y: 0, spread: 0, sat: 0, u: 0, v: 0,
  });
  const n = frames.length;
  return { y: sum.y / n, spread: sum.spread / n, sat: sum.sat / n, u: sum.u / n, v: sum.v / n };
}
