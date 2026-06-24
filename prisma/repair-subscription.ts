import "dotenv/config";
import { prisma } from "../lib/prisma";

// One-time repair: the owner account was left linked to a now-retired
// Studio 6-month plan with subscriptionEndsAt = NULL (fulfillment never ran),
// so every page reported "no active plan". Restore an active Studio term.
//
// Idempotent — safe to re-run. Run with: npx tsx prisma/repair-subscription.ts

const EMAIL = "divyansh.verma525@gmail.com";
const STUDIO_MONTHLY_CREDITS = 320;
const TERM_MONTHS = 6; // honor the original 6-month intent

async function main() {
  // Prefer the active Studio monthly plan as the link target.
  const studioPlan =
    (await prisma.plan.findUnique({ where: { slug: "sub_studio_1mo" } })) ??
    (await prisma.plan.findFirst({ where: { kind: "subscription", monthlyCredits: STUDIO_MONTHLY_CREDITS, active: true } }));

  if (!studioPlan) {
    console.error("No active Studio plan found — re-seed first (npx tsx prisma/seed.ts).");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, credits: true },
  });
  if (!user) {
    console.error(`User ${EMAIL} not found.`);
    process.exit(1);
  }

  const now = new Date();
  const endsAt = new Date(now); endsAt.setMonth(endsAt.getMonth() + TERM_MONTHS);
  const nextRefill = new Date(now); nextRefill.setMonth(nextRefill.getMonth() + 1);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      planId: studioPlan.id,
      subscriptionEndsAt: endsAt,
      nextRefillAt: nextRefill,
      monthlyCredits: STUDIO_MONTHLY_CREDITS,
      veo3Enabled: true,
      credits: Math.max(user.credits, STUDIO_MONTHLY_CREDITS),
    },
    select: { email: true, credits: true, monthlyCredits: true, subscriptionEndsAt: true, veo3Enabled: true, plan: { select: { name: true } } },
  });

  console.log("Repaired subscription:");
  console.log(`  ${updated.email}`);
  console.log(`  plan: ${updated.plan?.name}`);
  console.log(`  monthlyCredits: ${updated.monthlyCredits}`);
  console.log(`  credits: ${updated.credits}`);
  console.log(`  veo3Enabled: ${updated.veo3Enabled}`);
  console.log(`  subscriptionEndsAt: ${updated.subscriptionEndsAt?.toISOString()}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
