// "free" is NOT a purchasable Plan row — it's the sentinel for "no active
// subscription" (or an expired one), exactly as today's code already treats
// it implicitly (see requireSubscriber in lib/auth.ts). It exists in
// TIER_ORDER only so comparisons work uniformly; the pricing page markets
// four tiers: Free plus three paid ones (creator/pro/studio). A ₹499 "lite"
// tier existed from 2026-10-30 to 2026-11-20; it never sold and was retired
// (its Plan rows stay, inactive, for history; see RETIRED_SUB_SLUGS in
// prisma/seed.ts).
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
  studio: "Agency",
};

/** Customer-facing plan name for every tier, the free one included. Display
 *  only: ids, Plan.tier and slugs keep free/creator/pro/studio. Renamed
 *  2026-11-20: Free -> Starter, Studio -> Agency. */
export const PLAN_NAME: Record<TierId, string> = { free: "Starter", ...TIER_LABEL };

// Per-tier Assets-library storage cap, in GB. Server-enforced via
// storageLimitBytesForTier in lib/asset-service.ts (assertUnderStorageQuota)
// — the storage meter shown in app/dashboard/assets/page.tsx and
// app/components/settings/sections/GeneralSection.tsx reads this same map (via /api/assets's
// `limitBytes`) instead of a hardcoded display constant. SidebarAccount.tsx
// does not render a storage meter at all — it's a lightweight account
// popover, not the place this value is displayed.
// free 0.5 -> 1.5 on 2026-11-26, with the free file cap 250 MB -> 1 GB: gameplay
// recordings are big, and 37 uploads had been turned away at 250 MB. Minutes,
// not bytes, are what limit a free account's cost. Still under Creator's 2.
export const STORAGE_LIMIT_GB: Record<TierId, number> = {
  free: 1.5,
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
  free: 1 * 1024 ** 3, // 1 GB (250 MB until 2026-11-26)
  creator: 1.5 * 1024 ** 3, // 1.5 GB (1 GB until 2026-11-26, when free moved up to 1 GB)
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
 * Original derivation (2026-09, when Studio Yearly was 33% off and granted 400
 * credits a month):
 *   Studio Yearly = round(499900 x 12 x 0.67 / 100) x 100 = 4,019,200 paise
 *   4,019,200 paise / (400 cr/mo x 12) = ₹8.373 per credit
 *   ₹8.373 / 88 INR-per-USD                 = $0.0952 per credit
 *
 * STALE INPUTS, VALUE KEPT ON PURPOSE (pricing audit 2026-11-26): since
 * 2026-10-30 yearly plans are 25% off and Agency (studio) grants 300 credits,
 * so the same arithmetic now gives ₹12.50 = $0.142 per credit, and the cheapest
 * pure-credit SKU (Agency Pack, ₹8,999 / 640) is ₹14.06 = $0.160. Since the
 * Clip Minutes switch a plan's price also pays for its minutes, so no plan SKU
 * gives a clean per-credit figure any more. $0.0952 stays as a deliberately
 * conservative floor: every price that clears it clears every real SKU with
 * room to spare. Lower it only after deciding how plan revenue is split
 * between minutes and credits.
 *
 * NOTE: this is the LIST-price floor. Coupons cut it further, which is why
 * lib/coupons.ts caps the discount a subscription cart can take.
 *
 * GROSS, i.e. what the customer pays. Prices are GST-inclusive (see
 * lib/invoice/seller.ts), so this is not what we keep — price against
 * REVENUE_FLOOR_USD_PER_CREDIT below.
 */
export const REVENUE_FLOOR_GROSS_USD_PER_CREDIT = 0.0952;

/** GST on the service, percent. Mirrors GST_RATE_PERCENT in lib/invoice/seller.ts
 *  (not imported: that module pulls in email tokens, and this one is client-safe).
 *  lib/plans/tiers.test.ts fails if the two ever disagree. */
export const PRICING_GST_RATE_PERCENT = 18;

/** Razorpay's domestic fee (2%) plus 18% GST on that fee, as a share of gross. */
export const PAYMENT_GATEWAY_FEE_SHARE = 0.02 * 1.18;

/**
 * NET revenue per credit at the cheapest live SKU — the floor every credit
 * price is checked against (lib/models/pricing.test.ts).
 *
 *   $0.0952 / 1.18 (GST)          = $0.08068
 *   − $0.0952 x 2.36% (gateway)   = $0.00225
 *                                  = $0.0784 per credit
 *
 * The 2026-09-26 pricing audit found every "3x" price had been set against the
 * GROSS figure, so the real margin after tax was ~2.4x. Pricing formula for any
 * credit-billed feature: ceil(costUsd x margin / REVENUE_FLOOR_USD_PER_CREDIT).
 */
export const REVENUE_FLOOR_USD_PER_CREDIT =
  Math.floor(
    (REVENUE_FLOOR_GROSS_USD_PER_CREDIT / (1 + PRICING_GST_RATE_PERCENT / 100) -
      REVENUE_FLOOR_GROSS_USD_PER_CREDIT * PAYMENT_GATEWAY_FEE_SHARE) * 10000,
  ) / 10000;

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
  free: 5,
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

// ── Clip Minutes policy (2026-09-26 pricing plan) ───────────────────────────
// AutoClip bills 1 Clip Minute per minute of uploaded source (rounded up per
// video, see billableSourceMinutes in lib/minutes.ts), however many clips it
// produces — the unit Opus Clip, Vizard and 2short all sell.

/** Free tier: watermarked Clip Minutes granted monthly as expiring bonus minutes
 *  (replaces the old "2 runs a month" allowance). 30 -> 15 in the 2026-10-30
 *  restructure: most free minutes expired unused, and a recurring 30 a month
 *  per email was the cheapest thing to farm. New accounts still start with
 *  FREE_TIER_SIGNUP_MINUTES. 15 -> 10 on 2026-11-26 (conversion plan): free
 *  is a taste, the trial is the way to more. */
export const FREE_TIER_MONTHLY_BONUS_MINUTES = 10;

/** One-off Clip Minutes a new account starts with (same bonus bucket and expiry
 *  as the monthly drip), so a first AutoClip run of a real video still fits.
 *  30 -> 15 on 2026-11-26: the median first run was 7 minutes and 15 covers
 *  74% of first runs, while 30 meant almost nobody ever ran out. Accounts that
 *  already have minutes keep them. */
export const FREE_TIER_SIGNUP_MINUTES = 15;

/** Re-running a source this user already paid for, within this many days, is
 *  free — its transcript and face timeline are cached, so a re-run costs us
 *  almost nothing. */
export const AUTOCLIP_RERUN_FREE_WINDOW_DAYS = 7;

/** When a user is out of minutes they can opt in to pay the shortfall in AI
 *  credits at this rate. 3 minutes cost ~$0.024 (2026-11-26 measured
 *  $0.008/min) against ~$0.078 of net credit revenue, so this clears 3x — and
 *  nobody is hard-blocked mid-project. */
export const OVERFLOW_MINUTES_PER_CREDIT = 3;

/**
 * "Running low" on Clip Minutes: at or under ~20% of the monthly minutes (the
 * same line the low-credits email uses). Client-safe — the header pill and the
 * low-minutes email (lib/minute-events.ts) share it.
 */
export function isLowMinutes(balance: number, monthlyMinutes: number): boolean {
  if (monthlyMinutes <= 0 || balance <= 0) return false;
  return balance <= Math.ceil(monthlyMinutes * 0.2);
}

export function overflowCreditsFor(minutesShort: number): number {
  return minutesShort > 0 ? Math.ceil(minutesShort / OVERFLOW_MINUTES_PER_CREDIT) : 0;
}

// Credits granted once when the Pro trial starts (the mandate is
// authenticated — see lib/billing/trial.ts). Hard-capped and deliberately NOT a
// subscription-bucket base for rollover. Exported so the pricing CTA can state
// the figure instead of offering an unquantified "free trial".
export const TRIAL_CREDITS = 15;

/** Clip Minutes granted with the Pro trial (2026-09-26 model). Without them a
 *  trial user met Pro's headline feature, Auto Clips, with a zero balance. Same
 *  one-off, subscription-bucket treatment as TRIAL_CREDITS. 30 -> 60 on
 *  2026-11-26: at 30 the trial gave no more minutes than a new free account
 *  did, so "start a trial" only bought a watermark-free version. */
export const TRIAL_MINUTES = 60;

/** Length of the Pro trial. 7 -> 3 on 2026-11-20 (with 60 -> 30 minutes and
 *  25 -> 15 credits): a shorter window adds urgency, and the first charge
 *  lands while the trial is still fresh. */
export const TRIAL_DAYS = 3;

/** Only the MONTHLY Pro plan carries a trial — an annual Pro trial would end in
 *  a ₹19,791 auto-debit, above RBI's ₹15,000 no-OTP e-mandate limit, which the
 *  bank will not let through unattended. Client-safe: the pricing page uses it
 *  to decide which card offers the trial. */
export function isTrialPlan(plan: { kind: string; tier: string | null; intervalMonths: number | null }): boolean {
  return plan.kind === "subscription" && plan.tier === "pro" && (plan.intervalMonths ?? 1) === 1;
}

/** RBI's limit for an e-mandate debit without customer authentication, paise. */
export const RBI_EMANDATE_NO_OTP_LIMIT_PAISE = 15_000 * 100;

/** Whether an INR renewal of this plan needs the customer to approve it at
 *  their bank (Pro and Studio yearly today). Client-safe: the pricing page and
 *  the expiry-warning email both say so up front. */
export function renewalNeedsApproval(plan: { priceInPaise: number; currency?: string | null }): boolean {
  return (plan.currency ?? "INR") === "INR" && plan.priceInPaise > RBI_EMANDATE_NO_OTP_LIMIT_PAISE;
}

// Monthly bonus-credit grant for users without an active subscription.
// Bonus credits expire 30 days after the latest bonus grant.
export const FREE_TIER_MONTHLY_BONUS_CREDITS = 10;
/** Bonus Clip Minutes expire on the same clock as bonus credits. */
export const BONUS_MINUTES_EXPIRY_DAYS = 30;
export const BONUS_CREDITS_EXPIRY_DAYS = 30;
