// Zod schemas for every mutating admin route + shared list-query params.
// Bounds are deliberately generous but finite — they exist to stop typos
// (commissionRate 2 instead of 0.2) from becoming financial incidents, not to
// encode business policy. All object schemas are strict: unknown keys are a
// client bug we want surfaced, not silently dropped.

import { z } from "zod";
import { KNOWN_RENDER_QUEUE_NAMES } from "@/lib/render-queue";
import { FEATURE_USED_VALUES, REVIEW_RATING_MAX, REVIEW_RATING_MIN, REVIEW_TITLE_MAX, REVIEW_BODY_MIN, REVIEW_BODY_MAX } from "@/lib/reviews/constants";

const credits = z.number().int().min(0).max(1_000_000);
const paise = z.number().int().min(0).max(10_000_000);

// ── Users ─────────────────────────────────────────────────────────────────────
// NOTE: no `credits` field. User.credits is a denormalized total of the three
// bucket columns that lib/credits.ts recomputes on every spend, so setting it
// to an absolute value here produced a balance the user could see but never
// spend, with no CreditTransaction row behind it. Balance corrections go
// through POST /api/admin/users/[id]/credits (delta + mandatory reason +
// rate limit), which is bucket- and ledger-aware.
export const userPatchSchema = z
  .object({
    monthlyCredits: credits.optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    planId: z.string().min(1).nullable().optional(),
    subscriptionEndsAt: z.coerce.date().nullable().optional(),
    name: z.string().max(100).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    // Required only when granting ADMIN — mints a second full admin, so it
    // gets the same explicit-confirm gate as the other high-blast-radius
    // actions below, not just an enum-validated dropdown value.
    confirm: z.literal(true).optional(),
    // Audit-trail only, never persisted on the User row (stripped before the
    // Prisma write). Required for a plan change — see the refine below.
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
  .refine((v) => !("planId" in v) || (v.reason?.length ?? 0) >= 3, {
    message: "A reason is required when changing a user's plan",
    path: ["reason"],
  })
  .refine((v) => v.role !== "ADMIN" || v.confirm === true, {
    message: "confirm is required when granting the ADMIN role",
    path: ["confirm"],
  });

// ── Plans ─────────────────────────────────────────────────────────────────────
const planFields = {
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only").min(1).max(64),
  name: z.string().trim().min(1).max(100),
  priceInPaise: paise,
  credits,
  currency: z.literal("INR"),
  features: z.array(z.string().max(200)).max(20),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  kind: z.enum(["pack", "subscription", "addon"]),
  intervalMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).nullable(),
  monthlyCredits: credits.nullable(),
  tier: z.enum(["creator", "pro", "studio"]).nullable(),
};
export const planCreateSchema = z
  .object({
    slug: planFields.slug,
    name: planFields.name,
    priceInPaise: planFields.priceInPaise,
    credits: planFields.credits,
    currency: planFields.currency.optional(),
    features: planFields.features.optional(),
    active: planFields.active.optional(),
    sortOrder: planFields.sortOrder.optional(),
    kind: planFields.kind.optional(),
    intervalMonths: planFields.intervalMonths.optional(),
    monthlyCredits: planFields.monthlyCredits.optional(),
    tier: planFields.tier.optional(),
  })
  .strict();
export const planPatchSchema = z
  .object({
    name: planFields.name.optional(),
    priceInPaise: planFields.priceInPaise.optional(),
    credits: planFields.credits.optional(),
    currency: planFields.currency.optional(),
    features: planFields.features.optional(),
    active: planFields.active.optional(),
    sortOrder: planFields.sortOrder.optional(),
    kind: planFields.kind.optional(),
    intervalMonths: planFields.intervalMonths.optional(),
    monthlyCredits: planFields.monthlyCredits.optional(),
    tier: planFields.tier.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

// POST /api/admin/plans/[id]/sync-razorpay — provisions (or re-mints, with
// force) the immutable Razorpay Plan a subscription row bills against.
export const planSyncSchema = z
  .object({
    currencies: z.array(z.enum(["INR", "USD"])).min(1).max(2).optional(),
    force: z.boolean().optional(),
  })
  .strict();

/**
 * Cross-field rules a Plan row has to satisfy to actually work. Nothing enforced
 * these before, so /admin/pricing could save a subscription with no tier — which
 * renders nowhere on /pricing and grants no entitlement, because getUserTier
 * resolves a tier-less plan to "free" — or with a credits total that disagrees
 * with monthlyCredits x intervalMonths, which is what the purchase receipt and
 * the admin plan-assign grant both read.
 *
 * Returns an error message, or null when the shape is valid. Used on create
 * (against the body) and on update (against the MERGED row), since a PATCH is
 * partial and can't be judged on its own.
 */
export interface PlanShape {
  kind: string;
  intervalMonths?: number | null;
  monthlyCredits?: number | null;
  credits: number;
  tier?: string | null;
}

export function validatePlanShape(p: PlanShape): string | null {
  if (p.kind === "subscription") {
    if (!p.tier) {
      return "A subscription plan needs a tier — without one it never appears on /pricing and grants no entitlements.";
    }
    if (!p.intervalMonths) return "A subscription plan needs an interval in months.";
    if (!p.monthlyCredits) return "A subscription plan needs a monthly credit allowance.";
    const expected = p.monthlyCredits * p.intervalMonths;
    if (p.credits !== expected) {
      return `Total credits should equal monthly credits x interval (${p.monthlyCredits} x ${p.intervalMonths} = ${expected}), but this plan says ${p.credits}.`;
    }
    return null;
  }
  // Packs and add-ons are one-time credit grants: a tier or a monthly allowance
  // on one is dead data that the tier gate and the refill cron both ignore.
  if (p.tier) return "Only subscription plans carry a tier.";
  if (p.intervalMonths || p.monthlyCredits) {
    return "Only subscription plans have an interval or a monthly credit allowance.";
  }
  return null;
}

// ── Coupons ───────────────────────────────────────────────────────────────────
const couponFields = {
  code: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9_-]{3,32}$/, "3–32 chars (A–Z, 0–9, - or _)")),
  description: z.string().max(500).nullable(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().min(1).max(10_000_000),
  appliesTo: z.enum(["all", "subscription", "pack"]),
  planSlugs: z.array(z.string().max(64)).max(50),
  minAmountInPaise: paise,
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
  perUserLimit: z.number().int().min(1).max(100),
  firstPurchaseOnly: z.boolean(),
  featured: z.boolean(),
  active: z.boolean(),
  expiresAt: z.coerce.date().nullable(),
};
const percentCeiling = (v: { discountType?: string; discountValue?: number }, ctx: z.RefinementCtx) => {
  if (v.discountType === "percent" && v.discountValue !== undefined && v.discountValue > 100) {
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage discount can't exceed 100" });
  }
};
export const couponCreateSchema = z
  .object({
    code: couponFields.code,
    description: couponFields.description.optional(),
    discountType: couponFields.discountType.optional(),
    discountValue: couponFields.discountValue,
    appliesTo: couponFields.appliesTo.optional(),
    planSlugs: couponFields.planSlugs.optional(),
    minAmountInPaise: couponFields.minAmountInPaise.optional(),
    maxRedemptions: couponFields.maxRedemptions.optional(),
    perUserLimit: couponFields.perUserLimit.optional(),
    firstPurchaseOnly: couponFields.firstPurchaseOnly.optional(),
    featured: couponFields.featured.optional(),
    active: couponFields.active.optional(),
    expiresAt: couponFields.expiresAt.optional(),
  })
  .strict()
  .superRefine((v, ctx) => percentCeiling({ discountType: v.discountType ?? "percent", discountValue: v.discountValue }, ctx));
export const couponPatchSchema = z
  .object({
    description: couponFields.description.optional(),
    discountType: couponFields.discountType.optional(),
    discountValue: couponFields.discountValue.optional(),
    appliesTo: couponFields.appliesTo.optional(),
    planSlugs: couponFields.planSlugs.optional(),
    minAmountInPaise: couponFields.minAmountInPaise.optional(),
    maxRedemptions: couponFields.maxRedemptions.optional(),
    perUserLimit: couponFields.perUserLimit.optional(),
    firstPurchaseOnly: couponFields.firstPurchaseOnly.optional(),
    featured: couponFields.featured.optional(),
    active: couponFields.active.optional(),
    expiresAt: couponFields.expiresAt.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
  .superRefine(percentCeiling); // percent-vs-current-type edge stays route-side (needs a DB read)

// ── Tools / AutoClip pricing ──────────────────────────────────────────────────
export const toolPatchSchema = z
  .object({
    slug: z.string().min(1).max(64),
    enabled: z.boolean().optional(),
    creditCost: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.creditCost !== undefined, { message: "Nothing to update" });

export const autoclipPricingSchema = z
  .object({
    perClip: z.number().int().min(0).max(10_000).optional(),
    perTwoMinutes: z.number().int().min(0).max(10_000).optional(),
    analysisPerHalfHour: z.number().int().min(0).max(10_000).optional(),
    rerender: z.number().int().min(0).max(10_000).optional(),
    dubPerMinute: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const autoclipCalibrationSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

// ── Currency (FX rate + USD price book) ──────────────────────────────────────
// PATCH /api/admin/currency. A null price-book entry clears the override for
// that slug, dropping it back to the FX conversion.
export const currencyConfigSchema = z
  .object({
    // Bounded to catch a fat-fingered rate before it reprices every pack:
    // 88 is the shipped default, so this spans roughly half to double it.
    inrPerUsd: z.number().min(40).max(200).optional(),
    priceBook: z
      .record(z.string().max(64), z.number().int().min(0).max(10_000_000).nullable())
      .optional(),
  })
  .strict()
  .refine((v) => v.inrPerUsd !== undefined || v.priceBook !== undefined, { message: "Nothing to update" });

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const extendSchema = z
  .object({
    userId: z.string().min(1),
    months: z.number().int().min(1).max(24).optional(),
    expire: z.boolean().optional(),
  })
  .strict();

export const refillSchema = z
  .object({
    userId: z.string().min(1),
    force: z.boolean().optional(),
  })
  .strict();

// ── Affiliates / commissions / payouts ───────────────────────────────────────
export const affiliatePatchSchema = z
  .object({
    status: z.enum(["active", "suspended", "banned"]).optional(),
    commissionRate: z.number().min(0).max(0.5).optional(),
    // Audit-trail only (mirrors commissionActionSchema's reason below) — never
    // persisted on the Affiliate row itself, stripped before the Prisma write.
    reason: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.commissionRate !== undefined, { message: "Nothing to update" });

export const commissionActionSchema = z
  .object({
    action: z.enum(["release", "reject"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const payoutSchema = z
  .object({
    payoutRef: z.string().trim().min(1).max(100),
  })
  .strict();

// ── List queries ──────────────────────────────────────────────────────────────
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.string().max(32).optional(),
});

// Affiliate list only — adds free-text search without changing the shared
// pageQuerySchema's contract for the other routes that reuse it unchanged.
export const affiliateQuerySchema = pageQuerySchema.extend({
  search: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(200).optional()),
});

// Subscriptions list — same free-text-search extension (email/name), added
// so the page can filter like Users' otherwise-identical table already did.
export const subscriptionsQuerySchema = pageQuerySchema.extend({
  search: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(200).optional()),
});

export const adminNotesSchema = z
  .object({ adminNotes: z.string().max(5000).nullable() })
  .strict();

export const moderateUserSchema = z
  .object({
    action: z.enum(["suspend", "unsuspend", "revoke_sessions"]),
    reason: z.string().max(500).optional(),
    // Required for the two actions that cut a live user off (suspend already
    // has a client confirm-flip; revoke_sessions previously had none at all).
    // Not required for "unsuspend" — that action is restorative, not destructive.
    confirm: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => v.action === "unsuspend" || v.confirm === true, {
    message: "confirm is required for this action",
    path: ["confirm"],
  });

export const refundSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    clawbackCredits: z.boolean().default(true),
  })
  .strict();

export const creditAdjustSchema = z
  .object({
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, { message: "delta cannot be zero" }),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const modelOverrideSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    enabled: z.boolean().optional(),
    creditCost: z.number().min(0).max(10_000).nullable().optional(), // image: flat · video: per second
    clear: z.boolean().optional(), // remove the override entirely
  })
  .strict()
  .refine((v) => v.clear || v.enabled !== undefined || v.creditCost !== undefined, { message: "Nothing to update" });

export const opsJobActionSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    action: z.enum(["retry", "remove"]),
    // Optional + defaulted (not required) so any existing caller that only
    // ever knew about the editor-render queue keeps working unchanged.
    queueName: z.enum(KNOWN_RENDER_QUEUE_NAMES).optional(),
  })
  .strict();

export const opsFlagsSchema = z
  .object({
    flag: z.object({ name: z.string().regex(/^[\w.-]{1,64}$/), value: z.boolean().nullable() }).strict().optional(),
    // confirm required in both directions — flipping maintenance ON blocks
    // all non-admin traffic site-wide, and flipping it OFF mid-incident with
    // one accidental click is just as consequential.
    maintenance: z.object({ on: z.boolean(), message: z.string().max(300).optional(), confirm: z.literal(true) }).strict().optional(),
  })
  .strict()
  .refine((v) => v.flag !== undefined || v.maintenance !== undefined, { message: "Nothing to update" });

// POST /api/admin/ops/sessions — revokes every non-admin session platform-wide.
// The UI already gates this behind a confirm-flip; this makes that
// confirmation a server-enforced requirement, not just a UI courtesy.
export const opsSessionsRevokeSchema = z.object({ confirm: z.literal(true) }).strict();

// Empty-string query params (cleared filter inputs) are treated as absent.
const blankAsUndefined = (v: unknown) => (v === "" ? undefined : v);
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.preprocess(blankAsUndefined, z.string().max(64).optional()),
  targetId: z.preprocess(blankAsUndefined, z.string().max(128).optional()),
  adminEmail: z.preprocess(blankAsUndefined, z.string().max(200).optional()),
  from: z.preprocess(blankAsUndefined, z.coerce.date().optional()),
  to: z.preprocess(blankAsUndefined, z.coerce.date().optional()),
});

export const metricsQuerySchema = z.object({
  section: z.enum(["kpis", "revenue", "ai", "social", "infra", "growth", "overview", "top", "activity"]),
  range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)])).default(30),
  compare: z.coerce.boolean().default(false),
});

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.preprocess(blankAsUndefined, z.enum(["pending", "published", "rejected", "hidden"]).optional()),
  rating: z.preprocess(blankAsUndefined, z.coerce.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX).optional()),
  feature: z.preprocess(blankAsUndefined, z.enum(FEATURE_USED_VALUES).optional()),
  search: z.preprocess(blankAsUndefined, z.string().max(200).optional()),
  spamMin: z.preprocess(blankAsUndefined, z.coerce.number().int().min(0).max(100).optional()),
  reported: z.preprocess(blankAsUndefined, z.coerce.boolean().optional()),
});

export const reviewModerateSchema = z
  .object({
    action: z.enum(["approve", "reject", "hide", "unhide", "pin", "unpin"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => v.action !== "reject" || !!v.reason, { message: "A reason is required to reject a review" });

export const reviewAdminPatchSchema = z
  .object({
    rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX).optional(),
    title: z.string().trim().max(REVIEW_TITLE_MAX).nullable().optional(),
    body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX).optional(),
    featureUsed: z.enum(FEATURE_USED_VALUES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const reviewSettingsPatchSchema = z
  .object({
    minAccountAgeHours: z.number().int().min(0).max(24 * 30).optional(),
    requireProductUsage: z.boolean().optional(),
    spamScoreAutoHideThreshold: z.number().int().min(0).max(100).optional(),
    autoHideReportThreshold: z.number().int().min(1).max(100).optional(),
    promptThrottleDays: z.number().int().min(1).max(365).optional(),
    promptMaxLifetime: z.number().int().min(1).max(20).optional(),
    emailDrip1DelayHours: z.number().int().min(1).max(24 * 30).optional(),
    emailDrip2DelayDays: z.number().int().min(1).max(60).optional(),
    emailDrip3DelayDays: z.number().int().min(1).max(60).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
