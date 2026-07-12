import "dotenv/config";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "divyansh.verma525@gmail.com";

// Source of truth for all plans. The checkout route, Razorpay webhook, and
// public /pricing page read these from the DB via the Plan table.
//
//   kind="subscription" → recurring tier; refills `monthlyCredits` each month
//     for `intervalMonths`. priceInPaise is the (discounted) prepaid term total.
//   kind="pack"         → one-time credit top-up (subscriber-only).

interface SeedPlan {
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;            // total credits the purchase ultimately grants
  sortOrder: number;
  features: string[];
  kind: "subscription" | "pack";
  intervalMonths?: number;
  monthlyCredits?: number;
  tier?: "creator" | "pro" | "studio"; // subscription rows only; see lib/plans/tiers.ts
}

// ── Subscriptions ───────────────────────────────────────────────────────────
// Two terms only: Monthly + Yearly. Yearly = monthly × 12 × 0.80 (20% off).
const YEARLY_DISCOUNT = 0.20;
const yearly = (monthlyPaise: number) => Math.round((monthlyPaise * 12 * (1 - YEARLY_DISCOUNT)) / 100) * 100;

// 2026-07 repricing: entry tier was $6.7-8.4/mo equivalent vs $13-35/mo for
// comparable competitors (Crayo.ai, CapCut Pro, Descript, Veed, Opus Clip) —
// see the pricing review. Existing subscribers are unaffected: their
// credits/term live on the User row (monthlyCredits/nextRefillAt), not on a
// live Plan price lookup, so bumping priceInPaise here only affects new
// checkouts of these slugs going forward.
const SUBSCRIPTIONS: SeedPlan[] = [
  // Creator — 50 cr/mo (₹999/mo).
  { slug: "sub_creator_1mo",  name: "Creator (Monthly)", priceInPaise: 99900,            intervalMonths: 1,  monthlyCredits: 50,  sortOrder: 10, tier: "creator" as const, features: ["50 credits / month", "All AI tools", "1080p exports"] },
  { slug: "sub_creator_12mo", name: "Creator (Yearly)",  priceInPaise: yearly(99900),    intervalMonths: 12, monthlyCredits: 50,  sortOrder: 13, tier: "creator" as const, features: ["50 credits / month", "Save 20% vs monthly"] },
  // Pro — 140 cr/mo (₹2,199/mo).
  { slug: "sub_pro_1mo",  name: "Pro (Monthly)", priceInPaise: 219900,           intervalMonths: 1,  monthlyCredits: 140, sortOrder: 20, tier: "pro" as const, features: ["140 credits / month", "All AI tools", "Priority rendering"] },
  { slug: "sub_pro_12mo", name: "Pro (Yearly)",  priceInPaise: yearly(219900),   intervalMonths: 12, monthlyCredits: 140, sortOrder: 23, tier: "pro" as const, features: ["140 credits / month", "Save 20% vs monthly"] },
  // Studio — 340 cr/mo (₹4,999/mo).
  { slug: "sub_studio_1mo",  name: "Studio (Monthly)", priceInPaise: 499900,          intervalMonths: 1,  monthlyCredits: 340, sortOrder: 30, tier: "studio" as const, features: ["340 credits / month", "Priority rendering", "Dedicated support"] },
  { slug: "sub_studio_12mo", name: "Studio (Yearly)",  priceInPaise: yearly(499900),  intervalMonths: 12, monthlyCredits: 340, sortOrder: 33, tier: "studio" as const, features: ["340 credits / month", "Save 20% vs monthly"] },
].map(p => ({ ...p, kind: "subscription" as const, credits: p.monthlyCredits * p.intervalMonths }));

// Old 3-month / 6-month terms are retired. Deactivate them (keep rows for
// purchase history) so they disappear from /pricing and admin shows them inactive.
// pack_veo3_5 / addon_veo3 are retired for the same reason: Veo3 is no longer
// a separately-priced/pooled model, it's just a normal tier-gated video model.
const RETIRED_SUB_SLUGS = [
  "sub_creator_3mo", "sub_creator_6mo",
  "sub_pro_3mo", "sub_pro_6mo",
  "sub_studio_3mo", "sub_studio_6mo",
  "pack_veo3_5", "addon_veo3",
];

// ── Top-up packs (open to all users) ────────────────────────────────────────
const PACKS: SeedPlan[] = [
  { slug: "pack_mini",    name: "Mini Pack",    priceInPaise:  59900, credits:  30, sortOrder: 40, kind: "pack", features: ["30 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_starter", name: "Starter Pack", priceInPaise: 159900, credits: 100, sortOrder: 41, kind: "pack", features: ["100 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_pro",     name: "Pro Pack",     priceInPaise: 399900, credits: 280, sortOrder: 42, kind: "pack", features: ["280 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_studio",  name: "Studio Pack",  priceInPaise: 899900, credits: 640, sortOrder: 43, kind: "pack", features: ["640 credits", "Best value", "Never expires"] },
];

const PLANS: SeedPlan[] = [...SUBSCRIPTIONS, ...PACKS];

// ── Launch coupons ──────────────────────────────────────────────────────────
interface SeedCoupon {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  appliesTo: "all" | "subscription" | "pack";
  minAmountInPaise?: number;
  maxRedemptions?: number | null;
  perUserLimit?: number;
  firstPurchaseOnly?: boolean;
  featured?: boolean;
  expiresAt?: Date | null;
}

const LAUNCH = new Date(); LAUNCH.setDate(LAUNCH.getDate() + 30); // 30-day launch window

const COUPONS: SeedCoupon[] = [
  { code: "LAUNCH30",   description: "Launch special — 30% off your first plan", discountType: "percent", discountValue: 30, appliesTo: "subscription", firstPurchaseOnly: true, perUserLimit: 1, featured: true, expiresAt: LAUNCH },
  { code: "FOUNDERS50", description: "Founders deal — 40% off for the first 50 customers", discountType: "percent", discountValue: 40, appliesTo: "subscription", firstPurchaseOnly: true, perUserLimit: 1, maxRedemptions: 50, expiresAt: LAUNCH },
  { code: "TOPUP15",    description: "15% off any credit top-up pack", discountType: "percent", discountValue: 15, appliesTo: "pack" },
];

async function main() {
  // ── Plans ────────────────────────────────────────────────────────────────
  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        priceInPaise: p.priceInPaise,
        credits: p.credits,
        sortOrder: p.sortOrder,
        features: p.features,
        kind: p.kind,
        intervalMonths: p.intervalMonths ?? null,
        monthlyCredits: p.monthlyCredits ?? null,
        tier: p.tier ?? null,
        active: true,
      },
      create: {
        slug: p.slug,
        name: p.name,
        priceInPaise: p.priceInPaise,
        credits: p.credits,
        sortOrder: p.sortOrder,
        features: p.features,
        kind: p.kind,
        intervalMonths: p.intervalMonths ?? null,
        monthlyCredits: p.monthlyCredits ?? null,
        tier: p.tier ?? null,
        currency: "INR",
        active: true,
      },
    });
    console.log("Seeded plan:", plan.slug, "| ₹", plan.priceInPaise / 100, "|", plan.kind, "|", plan.credits, "credits");
  }

  // ── Retire old 3mo / 6mo terms ───────────────────────────────────────────
  const retired = await prisma.plan.updateMany({
    where: { slug: { in: RETIRED_SUB_SLUGS } },
    data: { active: false },
  });
  console.log("Deactivated retired terms:", retired.count);

  // ── Launch coupons ───────────────────────────────────────────────────────
  for (const c of COUPONS) {
    const coupon = await prisma.coupon.upsert({
      where: { code: c.code },
      update: {
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        appliesTo: c.appliesTo,
        minAmountInPaise: c.minAmountInPaise ?? 0,
        maxRedemptions: c.maxRedemptions ?? null,
        perUserLimit: c.perUserLimit ?? 1,
        firstPurchaseOnly: c.firstPurchaseOnly ?? false,
        featured: c.featured ?? false,
        active: true,
        expiresAt: c.expiresAt ?? null,
      },
      create: {
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        appliesTo: c.appliesTo,
        minAmountInPaise: c.minAmountInPaise ?? 0,
        maxRedemptions: c.maxRedemptions ?? null,
        perUserLimit: c.perUserLimit ?? 1,
        firstPurchaseOnly: c.firstPurchaseOnly ?? false,
        featured: c.featured ?? false,
        active: true,
        expiresAt: c.expiresAt ?? null,
      },
    });
    console.log("Seeded coupon:", coupon.code, "|", coupon.discountValue + (coupon.discountType === "percent" ? "%" : "p"), "|", coupon.appliesTo);
  }

  // ── Test user ────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("password123", 12);
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: { email: "test@example.com", passwordHash: hash, credits: 30 },
  });
  console.log("Seeded test user:", user.email, "| credits:", user.credits);

  // ── Admin bootstrap ──────────────────────────────────────────────────────
  // Promote the owner account to ADMIN. If it doesn't exist yet, create it with
  // a random one-time password printed below — there is no static/default
  // admin password checked into source.
  // Split into update-or-create instead of upsert: Prisma validates the
  // upsert's `create` input even when only the update branch runs, so an
  // undefined passwordHash (the existing-admin case) fails validation.
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existingAdmin) {
    const admin = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: "ADMIN" },
    });
    console.log("Admin ready:", admin.email, "| role:", admin.role);
  } else {
    const generatedPassword = crypto.randomBytes(12).toString("base64url");
    const adminHash = await bcrypt.hash(generatedPassword, 12);
    const admin = await prisma.user.create({
      data: { email: ADMIN_EMAIL, passwordHash: adminHash, credits: 100, role: "ADMIN" },
    });
    console.log("Admin ready:", admin.email, "| role:", admin.role);
    console.log(`Admin one-time password: ${generatedPassword}  (save this now — it is not stored anywhere else; change it after first login)`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
