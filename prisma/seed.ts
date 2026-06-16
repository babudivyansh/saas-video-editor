import "dotenv/config";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "divyansh.verma525@gmail.com";

// Source of truth for the credit packs. The checkout route, Razorpay webhook,
// and public /pricing page all read these from the DB via the Plan table.
const PLANS = [
  {
    slug: "pack_starter",
    name: "Starter Pack",
    priceInPaise: 79900,
    credits: 60,
    sortOrder: 1,
    features: ["60 video credits", "All AI tools", "1080p exports", "Email support"],
  },
  {
    slug: "pack_pro",
    name: "Pro Pack",
    priceInPaise: 159900,
    credits: 180,
    sortOrder: 2,
    features: ["180 video credits", "All AI tools", "1080p exports", "Priority rendering", "Priority support"],
  },
  {
    slug: "pack_studio",
    name: "Studio Pack",
    priceInPaise: 399900,
    credits: 600,
    sortOrder: 3,
    features: ["600 video credits", "All AI tools", "4K exports", "Priority rendering", "Dedicated support"],
  },
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
        active: true,
      },
      create: { ...p, currency: "INR", active: true },
    });
    console.log("Seeded plan:", plan.slug, "| ₹", plan.priceInPaise / 100, "|", plan.credits, "credits");
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
