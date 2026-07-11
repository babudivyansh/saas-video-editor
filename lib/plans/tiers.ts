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

// Business policy cap, not a provider limit — applies uniformly across all
// video models (and ai-creator). If a specific model's real provider ceiling
// is lower, that model's own maxDurationSeconds wins via the min() at the
// call site. A "free" (no active plan) user is capped at the same ceiling as
// Creator when they reach a video model via an overridePool unlock (e.g. the
// Veo3 addon/pack), since "free" has no tier of its own to look up here.
export const TIER_MAX_DURATION_SECONDS: Record<Exclude<TierId, "free">, number> = {
  creator: 5,
  pro: 10,
  studio: 15,
};

export function maxDurationForTier(tier: TierId): number {
  return tier === "free" ? TIER_MAX_DURATION_SECONDS.creator : TIER_MAX_DURATION_SECONDS[tier];
}
