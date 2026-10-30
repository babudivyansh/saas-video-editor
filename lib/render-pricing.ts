// What a local FFmpeg render costs the user (2026-10-30 pricing restructure).
//
// Cut & Crop, editor exports and Caption Studio exports have no provider cost —
// only render-box time — and paying customers noticed a credit taken for a
// local render. So on a paid plan they are free up to a shared daily allowance,
// and cost 1 credit after it (or on the free plan). 4K is the exception: it
// holds the single-threaded encoder several times longer than 1080p, so it is
// always charged, at EXPORT_4K_CREDIT_COST, and never draws on the allowance.

import { rateLimit } from "@/lib/rate-limit";
import type { TierId } from "@/lib/plans/tiers";

/** The price of a render on the free plan, or past the paid allowance. */
export const LOCAL_RENDER_CREDIT_COST = 1;

/** Free renders a day on any paid plan, shared by every local-render tool. */
export const PAID_FREE_RENDERS_PER_DAY = 30;

/** Flat price of one 4K export (Pro and up). */
export const EXPORT_4K_CREDIT_COST = 3;

/**
 * Credits to charge for one local render. Call it right before the charge: on
 * a paid plan it takes one use of today's allowance. A use taken for a render
 * that then fails isn't returned — the allowance is a convenience, not a
 * balance, and 30 a day leaves room for retries.
 */
export async function localRenderCredits(userId: string, tier: TierId, opts: { is4k?: boolean } = {}): Promise<number> {
  if (opts.is4k) return EXPORT_4K_CREDIT_COST;
  if (tier === "free") return LOCAL_RENDER_CREDIT_COST;
  const { allowed } = await rateLimit(`free-render:${userId}`, PAID_FREE_RENDERS_PER_DAY, 24 * 60 * 60);
  return allowed ? 0 : LOCAL_RENDER_CREDIT_COST;
}
