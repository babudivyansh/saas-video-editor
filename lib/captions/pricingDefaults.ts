// Caption-render pricing: the shape, the defaults, and the pure arithmetic.
//
// Leaf module — no prisma — so the AutoClip create page can quote a premium
// caption price in the browser with the same function the server charges with.
// The Config-table read (getCaptionRenderPricing) stays in ./pricing.ts, which
// re-exports everything here so existing import sites are unchanged.

export interface CaptionRenderPricing {
  /**
   * Credits per BILLABLE minute (not per clip-minute — see billableMinutes).
   *
   * A conservative placeholder, NOT a researched price. Submagic does not
   * publish a per-minute API rate, which is also why "caption-render" ships
   * with costUsd: null and a tier gate in lib/tool-costs.ts. Confirm the real
   * rate against an invoice, then set this from the margin formula in
   * lib/models/videoModels.ts's header (cost x margin / REVENUE_FLOOR_USD_PER_CREDIT)
   * and drop the tier gate.
   */
  perBillableMinute: number;
  /** Charged once per render on top of the per-minute component. */
  perRender: number;
}

export const CAPTION_RENDER_PRICING_DEFAULTS: CaptionRenderPricing = {
  perBillableMinute: 8,
  perRender: 0,
};

/**
 * Billable minutes for a clip.
 *
 * Providers in this category round a partial minute UP to a whole billable one,
 * so a 12-second clip and a 59-second clip cost the same. That is the single
 * most important fact about the unit economics here, and the reason a run of 8
 * short clips costs 8 billable minutes rather than the ~4 their total length
 * would suggest.
 *
 * Always at least 1 — there is no such thing as a free zero-minute render.
 */
export function billableMinutes(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / 60));
}

/** What the user is charged. Internal credits only — provider $ never surfaces. */
export function estimateCaptionRenderCredits(durationSec: number, pricing: CaptionRenderPricing): number {
  return pricing.perRender + billableMinutes(durationSec) * pricing.perBillableMinute;
}
