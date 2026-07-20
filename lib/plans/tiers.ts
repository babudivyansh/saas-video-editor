// "free" is NOT a purchasable Plan row — it's the sentinel for "no active
// subscription" (or an expired one), exactly as today's code already treats
// it implicitly (see requireSubscriber in lib/auth.ts). It exists in
// TIER_ORDER only so comparisons work uniformly; the pricing page markets
// exactly 3 tiers (creator/pro/studio), matching what's already live.
export type TierId = "free" | "creator" | "pro" | "studio";

export const TIER_ORDER: readonly TierId[] = ["free", "creator", "pro", "studio"];

export function tierIndex(t: TierId): number {
  const i = TIER_ORDER.indexOf(t);
  if (i === -1) throw new Error(`Unknown tier: ${t}`);
  return i;
}

export function tierAtLeast(have: TierId, need: TierId): boolean {
  return tierIndex(have) >= tierIndex(need);
}

export function lowestTier(tiers: readonly TierId[]): TierId {
  return tiers.reduce((lowest, t) => (tierIndex(t) < tierIndex(lowest) ? t : lowest));
}

// Subset of TIER_ORDER excluding the "free" sentinel — used anywhere a
// purchasable-plan-per-card layout is needed (pricing page, landing preview,
// admin tier <select>).
export const PURCHASABLE_TIER_ORDER: readonly Exclude<TierId, "free">[] = ["creator", "pro", "studio"];

export const TIER_LABEL: Record<Exclude<TierId, "free">, string> = {
  creator: "Creator",
  pro: "Pro",
  studio: "Studio",
};

// Business policy cap, not a provider limit — applies uniformly across all
// video models (and ai-creator). If a specific model's real provider ceiling
// is lower, that model's own maxDurationSeconds wins via the min() at the
// call site. "free" has no tier of its own, so it's capped at the same
// ceiling as Creator — it should never actually reach a video model, since
// every video model's allowedTiers excludes "free".
export const TIER_MAX_DURATION_SECONDS: Record<Exclude<TierId, "free">, number> = {
  creator: 5,
  pro: 10,
  studio: 15,
};

export function maxDurationForTier(tier: TierId): number {
  return tier === "free" ? TIER_MAX_DURATION_SECONDS.creator : TIER_MAX_DURATION_SECONDS[tier];
}

// Per-tier Assets-library storage cap, in GB. Server-enforced in
// app/api/upload/route.ts and app/api/editor/stock/import/route.ts — the
// storage meter shown in the UI (app/dashboard/assets/page.tsx,
// app/components/SidebarAccount.tsx) reads this same map instead of a
// hardcoded display constant.
export const STORAGE_LIMIT_GB: Record<TierId, number> = {
  free: 0.5,
  creator: 2,
  pro: 5,
  studio: 15,
};

export function storageLimitBytesForTier(tier: TierId): number {
  return STORAGE_LIMIT_GB[tier] * 1024 ** 3;
}

// ── Credit-economy policy (2026-07 pricing audit) ───────────────────────────

// Subscription credits roll over month to month, capped at this multiple of
// the monthly grant. On refill: subscriptionCredits = min(current + grant,
// cap × grant). Unused purchased (pack) credits never expire.
export const SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER = 2;

// Render-queue priority by tier (BullMQ semantics: lower = sooner). Paid
// tiers jump the queue ahead of free renders — backs the "priority
// rendering" plan feature with real queue behavior.
export const TIER_RENDER_PRIORITY: Record<TierId, number> = {
  studio: 1,
  pro: 2,
  creator: 3,
  free: 4,
};

export function tierPriority(tier: TierId): number {
  return TIER_RENDER_PRIORITY[tier];
}

// Auto Clips source-video length cap by tier (cost ceiling per job and a
// clean upgrade trigger).
export const TIER_MAX_AUTOCLIP_SOURCE_SECONDS: Record<TierId, number> = {
  free: 30 * 60,
  creator: 2 * 60 * 60,
  pro: 4 * 60 * 60,
  studio: 6 * 60 * 60,
};

// Free-tier Auto Clip allowance: watermarked runs per rolling 30 days.
export const FREE_TIER_AUTOCLIP_RUNS_PER_MONTH = 2;

// Monthly bonus-credit grant for users without an active subscription.
// Bonus credits expire 30 days after the latest bonus grant.
export const FREE_TIER_MONTHLY_BONUS_CREDITS = 10;
export const BONUS_CREDITS_EXPIRY_DAYS = 30;
