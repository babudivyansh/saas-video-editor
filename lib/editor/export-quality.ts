// Export quality: 1080p (the default — the frame sizes in
// ASPECT_DIMENSIONS / docDimensions) or 4K (every side doubled, so 9:16 is
// 2160×3840 and 16:9 is 3840×2160). Client-safe: the export screens read the
// same rules the render routes enforce.
//
// 4K is four times the pixels and the encoder is pinned single-threaded
// (filtergraph.ts, P0-2), so it is plan-gated, length-capped, and given a
// render timeout that grows with the video's length.

import { tierAtLeast, type TierId } from "@/lib/plans/tiers";

export type ExportQuality = "1080p" | "4k";
export const EXPORT_QUALITIES: readonly ExportQuality[] = ["1080p", "4k"];

/** The lowest plan that may export in 4K. */
export const EXPORT_4K_MIN_TIER: Exclude<TierId, "free"> = "pro";

/**
 * Longest video a 4K export takes, in seconds. A full 4K render ran ~2.7×
 * real time on a fast desktop (1080p: ~0.4×), and renders share one queue,
 * so a long 4K export would hold everyone else's for most of an hour.
 */
export const EXPORT_4K_MAX_SECONDS = 5 * 60;

const BASE_TIMEOUT_MS = 15 * 60 * 1000;

export function isExportQuality(v: unknown): v is ExportQuality {
  return v === "1080p" || v === "4k";
}

/** How much each side of the doc's frame grows. */
export function qualityScale(q: ExportQuality): number {
  return q === "4k" ? 2 : 1;
}

/** The frame a doc renders at in this quality. */
export function exportFrame(frame: { w: number; h: number }, q: ExportQuality): { w: number; h: number } {
  const s = qualityScale(q);
  return { w: frame.w * s, h: frame.h * s };
}

/**
 * How long ffmpeg may run. 1080p keeps the shared 15-minute default; 4K gets
 * 15 minutes plus eight minutes per minute of video — about three times what a full
 * 4K render took on a fast desktop, for a slower server — so the longest 4K
 * video has 55 minutes.
 */
export function renderTimeoutMs(durationSec: number, q: ExportQuality): number {
  if (q !== "4k") return BASE_TIMEOUT_MS;
  return BASE_TIMEOUT_MS + Math.ceil(durationSec) * 8 * 1000;
}

export interface QualityRefusal {
  status: 403 | 400;
  body: { error: "quality_locked" | "quality_too_long"; message: string; requiredTier?: string };
}

/** Why this user can't export this long a video in this quality, or null. */
export function checkExportQuality(q: ExportQuality, tier: TierId, durationSec: number): QualityRefusal | null {
  if (q !== "4k") return null;
  if (!tierAtLeast(tier, EXPORT_4K_MIN_TIER)) {
    return { status: 403, body: { error: "quality_locked", message: "4K export is on the Pro and Studio plans.", requiredTier: EXPORT_4K_MIN_TIER } };
  }
  if (durationSec > EXPORT_4K_MAX_SECONDS) {
    return { status: 400, body: { error: "quality_too_long", message: `4K export takes videos up to ${EXPORT_4K_MAX_SECONDS / 60} minutes. Export this one in 1080p, or trim it.` } };
  }
  return null;
}
