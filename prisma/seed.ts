import "dotenv/config";
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
}

// ── Subscriptions ───────────────────────────────────────────────────────────
// Veo3 bundles free from: Studio 3mo+, Creator & Pro 6mo+.
const SUBSCRIPTIONS: SeedPlan[] = [
  // Creator — 45 cr/mo. 1/3/6mo no discount, 12mo 13% off.
  { slug: "sub_creator_1mo",  name: "Creator (Monthly)",   priceInPaise:  59900, intervalMonths: 1,  monthlyCredits: 45, veo3Included: false, sortOrder: 10, features: ["45 credits / month", "All AI tools", "1080p exports"] },
  { slug: "sub_creator_3mo",  name: "Creator (3 Months)",  priceInPaise: 179700, intervalMonths: 3,  monthlyCredits: 45, veo3Included: false, sortOrder: 11, features: ["45 credits / month", "All AI tools", "1080p exports"] },
  { slug: "sub_creator_6mo",  name: "Creator (6 Months)",  priceInPaise: 359400, intervalMonths: 6,  monthlyCredits: 45, veo3Included: true,  sortOrder: 12, features: ["45 credits / month", "All AI tools", "Veo3 AI video included"] },
  { slug: "sub_creator_12mo", name: "Creator (12 Months)", priceInPaise: 625400, intervalMonths: 12, monthlyCredits: 45, veo3Included: true,  sortOrder: 13, features: ["45 credits / month", "13% off", "Veo3 AI video included"] },
  // Pro — 130 cr/mo. 3/6/12mo at 10/15/20% off.
  { slug: "sub_pro_1mo",  name: "Pro (Monthly)",   priceInPaise: 149900,  intervalMonths: 1,  monthlyCredits: 130, veo3Included: false, sortOrder: 20, features: ["130 credits / month", "All AI tools", "Priority rendering"] },
  { slug: "sub_pro_3mo",  name: "Pro (3 Months)",  priceInPaise: 404700,  intervalMonths: 3,  monthlyCredits: 130, veo3Included: false, sortOrder: 21, features: ["130 credits / month", "10% off", "Priority rendering"] },
  { slug: "sub_pro_6mo",  name: "Pro (6 Months)",  priceInPaise: 764500,  intervalMonths: 6,  monthlyCredits: 130, veo3Included: true,  sortOrder: 22, features: ["130 credits / month", "15% off", "Veo3 AI video included"] },
  { slug: "sub_pro_12mo", name: "Pro (12 Months)", priceInPaise: 1439000, intervalMonths: 12, monthlyCredits: 130, veo3Included: true,  sortOrder: 23, features: ["130 credits / month", "20% off", "Veo3 AI video included"] },
  // Studio — 320 cr/mo. 3/6/12mo at 10/15/20% off; Veo3 from 3mo.
  { slug: "sub_studio_1mo",  name: "Studio (Monthly)",   priceInPaise:  349900, intervalMonths: 1,  monthlyCredits: 320, veo3Included: false, sortOrder: 30, features: ["320 credits / month", "Priority rendering", "Dedicated support"] },
  { slug: "sub_studio_3mo",  name: "Studio (3 Months)",  priceInPaise:  944700, intervalMonths: 3,  monthlyCredits: 320, veo3Included: true,  sortOrder: 31, features: ["320 credits / month", "10% off", "Veo3 AI video included"] },
  { slug: "sub_studio_6mo",  name: "Studio (6 Months)",  priceInPaise: 1784500, intervalMonths: 6,  monthlyCredits: 320, veo3Included: true,  sortOrder: 32, features: ["320 credits / month", "15% off", "Veo3 AI video included"] },
  { slug: "sub_studio_12mo", name: "Studio (12 Months)", priceInPaise: 3359000, intervalMonths: 12, monthlyCredits: 320, veo3Included: true,  sortOrder: 33, features: ["320 credits / month", "20% off", "Veo3 AI video included"] },
].map(p => ({ ...p, kind: "subscription" as const, credits: p.monthlyCredits * p.intervalMonths }));

// ── Top-up packs (subscriber-only) ──────────────────────────────────────────
const PACKS: SeedPlan[] = [
  { slug: "pack_mini",    name: "Mini Pack",    priceInPaise:  59900, credits:  30, sortOrder: 40, kind: "pack", features: ["30 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_starter", name: "Starter Pack", priceInPaise: 159900, credits: 100, sortOrder: 41, kind: "pack", features: ["100 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_pro",     name: "Pro Pack",     priceInPaise: 399900, credits: 280, sortOrder: 42, kind: "pack", features: ["280 credits", "One-time top-up", "Never expires"] },
  { slug: "pack_studio",  name: "Studio Pack",  priceInPaise: 899900, credits: 640, sortOrder: 43, kind: "pack", features: ["640 credits", "Best value", "Never expires"] },
];

// ── Veo3 add-on (unlock for shorter subscription terms) ─────────────────────
const ADDONS: SeedPlan[] = [
  { slug: "addon_veo3", name: "Veo3 AI Video Add-on", priceInPaise: 59900, credits: 0, sortOrder: 50, kind: "addon", veo3Included: true, features: ["Unlocks Veo3 AI video on your plan", "Usage draws from your credits"] },
];

const PLANS: SeedPlan[] = [...SUBSCRIPTIONS, ...PACKS, ...ADDONS];

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
        currency: "INR",
        active: true,
      },
    });
    console.log("Seeded plan:", plan.slug, "| ₹", plan.priceInPaise / 100, "|", plan.kind, "|", plan.credits, "credits");
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
  // a default password (CHANGE THIS after first login via the profile page).
  const adminHash = await bcrypt.hash("changeme123", 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: ADMIN_EMAIL, passwordHash: adminHash, credits: 100, role: "ADMIN" },
  });
  console.log("Admin ready:", admin.email, "| role:", admin.role);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
