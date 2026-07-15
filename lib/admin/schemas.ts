// Zod schemas for every mutating admin route + shared list-query params.
// Bounds are deliberately generous but finite — they exist to stop typos
// (commissionRate 2 instead of 0.2) from becoming financial incidents, not to
// encode business policy. All object schemas are strict: unknown keys are a
// client bug we want surfaced, not silently dropped.

import { z } from "zod";

const credits = z.number().int().min(0).max(1_000_000);
const paise = z.number().int().min(0).max(10_000_000);

// ── Users ─────────────────────────────────────────────────────────────────────
export const userPatchSchema = z
  .object({
    credits: credits.optional(),
    monthlyCredits: credits.optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    planId: z.string().min(1).nullable().optional(),
    subscriptionEndsAt: z.coerce.date().nullable().optional(),
    name: z.string().max(100).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

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
  kind: z.enum(["pack", "subscription"]),
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
    base: z.number().int().min(0).max(10_000).optional(),
    perExtraClip: z.number().int().min(0).max(10_000).optional(),
    perMinute: z.number().int().min(0).max(10_000).optional(),
    rerender: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

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

export const adminNotesSchema = z
  .object({ adminNotes: z.string().max(5000).nullable() })
  .strict();

export const moderateUserSchema = z
  .object({
    action: z.enum(["suspend", "unsuspend", "revoke_sessions"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

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
  })
  .strict();

export const opsFlagsSchema = z
  .object({
    flag: z.object({ name: z.string().regex(/^[\w.-]{1,64}$/), value: z.boolean().nullable() }).strict().optional(),
    maintenance: z.object({ on: z.boolean(), message: z.string().max(300).optional() }).strict().optional(),
  })
  .strict()
  .refine((v) => v.flag !== undefined || v.maintenance !== undefined, { message: "Nothing to update" });

export const metricsQuerySchema = z.object({
  section: z.enum(["kpis", "revenue", "ai", "social", "infra", "growth"]),
  range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
});
