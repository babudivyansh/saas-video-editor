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
  creator: 8,
  pro: 12,
  studio: 15,
};

export function maxDurationForTier(tier: TierId): number {
  return tier === "free" ? TIER_MAX_DURATION_SECONDS.creator : TIER_MAX_DURATION_SECONDS[tier];
}

// Per-tier Assets-library storage cap, in GB. Server-enforced via
// storageLimitBytesForTier in lib/asset-service.ts (assertUnderStorageQuota)
// — the storage meter shown in app/dashboard/assets/page.tsx and
// app/dashboard/settings/page.tsx reads this same map (via /api/assets's
// `limitBytes`) instead of a hardcoded display constant. SidebarAccount.tsx
// does not render a storage meter at all — it's a lightweight account
// popover, not the place this value is displayed.
export const STORAGE_LIMIT_GB: Record<TierId, number> = {
  free: 0.5,
  creator: 2,
  pro: 5,
  studio: 15,
};

export function storageLimitBytesForTier(tier: TierId): number {
  return STORAGE_LIMIT_GB[tier] * 1024 ** 3;
}

// Per-tier maximum for a SINGLE uploaded/imported file (distinct from the
// cumulative STORAGE_LIMIT_GB quota above). This is the one source of truth
// for the "max individual file size" cap. Enforced server-side via
// maxUploadBytesForTier by: the Assets library, AutoClip source uploads, URL
// import, and avatars (lib/asset-service.ts's assertFileSizeAllowed) — and,
// combined with a per-feature technical ceiling via min(), by the AI/utility
// tool routes under app/api/tools/* (lib/upload-policy.ts's
// resolveUploadPolicy). Numbers are business policy and freely tunable.
export const MAX_UPLOAD_BYTES_BY_TIER: Record<TierId, number> = {
  free: 250 * 1024 ** 2, // 250 MB
  creator: 1 * 1024 ** 3, // 1 GB
  pro: 2 * 1024 ** 3, // 2 GB
  studio: 5 * 1024 ** 3, // 5 GB
};

export function maxUploadBytesForTier(tier: TierId): number {
  return MAX_UPLOAD_BYTES_BY_TIER[tier];
}

// Shared upload MIME allow-list — the single regex every upload path validates
// against. Unrestricted MIME (e.g. text/html) would be a stored-XSS vector on
// the S3 origin, since objects are served back with their stored Content-Type
// and no forced download. Kept here (not per-route) so the allowed set stays
// identical across the Assets library, the generate flows and avatars.
export const ALLOWED_UPLOAD_MIME =
  /^(video|audio|image)\/(mp4|mpeg|quicktime|webm|x-matroska|mp3|wav|ogg|png|jpeg|jpg|webp|gif)$/;

// Human-readable byte size for user-facing limit errors, e.g. "850 MB", "1 GB".
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    const gb = bytes / 1024 ** 3;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

// ── Credit-economy policy (2026-07 pricing audit) ───────────────────────────

/**
 * Revenue per credit at the CHEAPEST live SKU — the floor every model price is
 * checked against (lib/models/pricing.test.ts).
 *
 * Derivation, from prisma/seed.ts and lib/currency.ts's FX default:
 *   Studio Yearly = round(499900 x 12 x 0.67 / 100) x 100 = 4,019,200 paise
 *   4,019,200 paise / (400 cr/mo x 12) = ₹8.373 per credit
 *   ₹8.373 / 88 INR-per-USD                 = $0.0952 per credit
 *
 * This replaces a hardcoded $0.099, documented as "Studio Yearly ≈ ₹9.41/credit
 * at ₹95/$1" — both figures went stale when the grants moved to 60/160/400 and
 * the FX default moved to 88, leaving every margin ~4% thinner than the CI guard
 * claimed. Keep this in step with whichever SKU is actually cheapest per credit;
 * it is deliberately the floor, not an average, so a model that clears it clears
 * it for every customer.
 *
 * NOTE: this is the LIST-price floor. Coupons cut it further, which is why
 * lib/coupons.ts caps the discount a subscription cart can take.
 */
export const REVENUE_FLOOR_USD_PER_CREDIT = 0.0952;

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
