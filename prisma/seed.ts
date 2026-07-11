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
//   kind="addon"        → ₹599 Veo3 unlock for shorter subscription terms.

interface SeedPlan {
  slug: string;
  name: string;
  priceInPaise: number;
  credits: number;            // total credits the purchase ultimately grants
  sortOrder: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths?: number;
  monthlyCredits?: number;
  veo3Included?: boolean;
  tier?: "creator" | "pro" | "studio"; // subscription rows only; see lib/plans/tiers.ts
}

// ── Subscriptions ───────────────────────────────────────────────────────────
// Two terms only: Monthly + Yearly. Yearly = monthly × 12 × 0.80 (20% off) and
// bundles Veo3 free. Monthly plans need the ₹599 addon_veo3 to unlock Veo3.
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
  { slug: "sub_creator_1mo",  name: "Creator (Monthly)", priceInPaise: 99900,            intervalMonths: 1,  monthlyCredits: 50,  veo3Included: false, sortOrder: 10, tier: "creator" as const, features: ["50 credits / month", "All AI tools", "1080p exports"] },
  { slug: "sub_creator_12mo", name: "Creator (Yearly)",  priceInPaise: yearly(99900),    intervalMonths: 12, monthlyCredits: 50,  veo3Included: true,  sortOrder: 13, tier: "creator" as const, features: ["50 credits / month", "Save 20% vs monthly", "Veo3 AI video included"] },
  // Pro — 140 cr/mo (₹2,199/mo).
  { slug: "sub_pro_1mo",  name: "Pro (Monthly)", priceInPaise: 219900,           intervalMonths: 1,  monthlyCredits: 140, veo3Included: false, sortOrder: 20, tier: "pro" as const, features: ["140 credits / month", "All AI tools", "Priority rendering"] },
  { slug: "sub_pro_12mo", name: "Pro (Yearly)",  priceInPaise: yearly(219900),   intervalMonths: 12, monthlyCredits: 140, veo3Included: true,  sortOrder: 23, tier: "pro" as const, features: ["140 credits / month", "Save 20% vs monthly", "Veo3 AI video included"] },
  // Studio — 340 cr/mo (₹4,999/mo).
  { slug: "sub_studio_1mo",  name: "Studio (Monthly)", priceInPaise: 499900,          intervalMonths: 1,  monthlyCredits: 340, veo3Included: false, sortOrder: 30, tier: "studio" as const, features: ["340 credits / month", "Priority rendering", "Dedicated support"] },
  { slug: "sub_studio_12mo", name: "Studio (Yearly)",  priceInPaise: yearly(499900),  intervalMonths: 12, monthlyCredits: 340, veo3Included: true,  sortOrder: 33, tier: "studio" as const, features: ["340 credits / month", "Save 20% vs monthly", "Veo3 AI video included"] },
].map(p => ({ ...p, kind: "subscription" as const, credits: p.monthlyCredits * p.intervalMonths }));

// Old 3-month / 6-month terms are retired. Deactivate them (keep rows for
// purchase history) so they disappear from /pricing and admin shows them inactive.
const RETIRED_SUB_SLUGS = [
  "sub_creator_3mo", "sub_creator_6mo",
  "sub_pro_3mo", "sub_pro_6mo",
  "sub_studio_3mo", "sub_studio_6mo",
];

// ── Top-up packs (open to all users) ────────────────────────────────────────
const PACKS: SeedPlan[] = [
  { slug: "pack_mini",    name: "Mini Pack",    priceInPaise:  59900, credits:  30, sortOrder: 40, kind: "pack", features: ["30 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_starter", name: "Starter Pack", priceInPaise: 159900, credits: 100, sortOrder: 41, kind: "pack", features: ["100 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_pro",     name: "Pro Pack",     priceInPaise: 399900, credits: 280, sortOrder: 42, kind: "pack", features: ["280 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_studio",  name: "Studio Pack",  priceInPaise: 899900, credits: 640, sortOrder: 43, kind: "pack", features: ["640 credits", "Best value", "Never expires"] },
  // Veo3-specific pack: 5 videos × 35 credits = 175 credits, ₹999 flat.
  // Keeps Veo3 economics separate so subscription credits aren't drained unexpectedly.
  { slug: "pack_veo3_5",  name: "Veo3 Video Pack", priceInPaise: 99900, credits: 175, sortOrder: 44, kind: "pack", features: ["5 Veo3 AI videos", "175 credits", "Never expires", "₹199.80 per video"] },
];

// ── Veo3 add-on (unlock for shorter subscription terms) ─────────────────────
const ADDONS: SeedPlan[] = [
  { slug: "addon_veo3", name: "Veo3 AI Video Add-on", priceInPaise: 59900, credits: 0, sortOrder: 50, kind: "addon", veo3Included: true, features: ["Unlocks Veo3 AI video on your plan", "Usage draws from your credits"] },
];

const PLANS: SeedPlan[] = [...SUBSCRIPTIONS, ...PACKS, ...ADDONS];

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
        veo3Included: p.veo3Included ?? false,
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
        veo3Included: p.veo3Included ?? false,
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
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const generatedPassword = existingAdmin ? null : crypto.randomBytes(12).toString("base64url");
  const adminHash = generatedPassword ? await bcrypt.hash(generatedPassword, 12) : undefined;
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: ADMIN_EMAIL, passwordHash: adminHash!, credits: 100, role: "ADMIN" },
  });
  console.log("Admin ready:", admin.email, "| role:", admin.role);
  if (generatedPassword) {
    console.log(`Admin one-time password: ${generatedPassword}  (save this now — it is not stored anywhere else; change it after first login)`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
