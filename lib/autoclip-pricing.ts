// AutoClip pricing: the shape, the defaults, and the pure cost arithmetic.
//
// Leaf module — no prisma, no ffmpeg, no side effects — so the CREATE PAGE can
// price a run in the browser using exactly the same function the server charges
// with. That matters now that the review step is gone: the price quoted next to
// the Generate button is the last thing a user sees before being charged, and
// a second, independently-maintained copy of the formula on the client is how
// those two silently drift apart.
//
// These lived in lib/autoclip-pipeline.ts, which imports prisma, the ffmpeg
// wrapper, S3, Gemini and the face-detection stack. getAutoClipPricing() (the
// Config-table read) stays there; only the pure parts moved. That file
// re-exports everything here, so every existing import site is unchanged.

// 2026-07 audit repricing. Charge model:
//   analyze:  analysisPerHalfHour × ceil(sourceMin/30), charged when the pick
//             job starts (deters "scan everything, render nothing"), then
//             CREDITED against the run charge — net zero for a run that renders.
//   run:      perClip × clips + perTwoMinutes × ceil(totalMin/2)
//             − analysis already paid (floored at 0).
//   rerender: first re-render of each clip free, then `rerender` each.
export interface AutoClipPricing {
  perClip: number;
  perTwoMinutes: number;
  analysisPerHalfHour: number;
  rerender: number;
  /** Per MINUTE of dubbed clip — see computeDubCost in lib/autoclip-dub.ts. */
  dubPerMinute: number;
}

export const AUTOCLIP_PRICING_DEFAULTS: AutoClipPricing = {
  perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1,
  // Dubbing was a flat 1 credit per dub at any length. 2 credits per minute is a
  // conservative placeholder, NOT a researched price — the real ElevenLabs
  // Dubbing per-minute cost is still unconfirmed, which is why clip-dub is
  // Pro-gated in lib/tool-costs.ts until it is.
  dubPerMinute: 2,
};

export function computeCreditCost(clipCount: number, totalDurationSec: number, pricing: AutoClipPricing): number {
  const twoMinuteBlocks = Math.ceil(totalDurationSec / 120);
  return clipCount * pricing.perClip + twoMinuteBlocks * pricing.perTwoMinutes;
}

export function computeAnalysisCost(sourceDurationSec: number, pricing: AutoClipPricing): number {
  return Math.ceil(sourceDurationSec / 1800) * pricing.analysisPerHalfHour;
}

export const analysisRefId = (projectId: string) => `auto-clip-analysis:${projectId}`;

/**
 * The lowest value each price may take. perClip/perTwoMinutes/dubPerMinute
 * are what a run or a dub actually costs, so 0 would make them free — a
 * misclick in admin, not a promotion (a promo belongs in a coupon, not the
 * base price). A free first re-render and a zero analysis advance are real
 * product choices, so those two may be 0.
 */
export const AUTOCLIP_PRICE_FLOORS: Record<keyof AutoClipPricing, number> = {
  perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 0, rerender: 0, dubPerMinute: 1,
};

/**
 * Reads the stored `autoclip_pricing` Config row field by field. A field that
 * is missing, not an integer, or below its floor falls back to its default
 * rather than being trusted: this used to be a bare spread of the parsed JSON,
 * so a `null` or a string stored in the row priced every run at zero.
 */
export function parseAutoClipPricing(raw: unknown): AutoClipPricing {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...AUTOCLIP_PRICING_DEFAULTS };
  for (const key of Object.keys(AUTOCLIP_PRICING_DEFAULTS) as (keyof AutoClipPricing)[]) {
    const v = src[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= AUTOCLIP_PRICE_FLOORS[key]) out[key] = v;
  }
  return out;
}
