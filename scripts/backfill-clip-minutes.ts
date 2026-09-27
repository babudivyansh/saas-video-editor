import "dotenv/config";
import { prisma } from "../lib/prisma";
import { grantFreeTierMinutes, grantMonthlyMinutes } from "../lib/minutes";

// Clip Minutes switch day (2026-09-26 pricing plan, Stage 3).
//
// From this deploy on, AutoClip is paid in Clip Minutes. New signups, the
// refill cron and every new payment grant minutes on their own — but every
// EXISTING account starts at zero, and without this a free user who had two
// free runs yesterday would be refused today. So, once:
//
//   - users with an active subscription get their plan's monthlyMinutes
//     stamped on the user row (so the cron refills them) and one month of
//     minutes granted now, under the usual 2x rollover cap;
//   - everyone else gets the free tier's monthly bonus minutes, expiring on
//     the normal bonus clock.
//
// Idempotent: a user who already has a "grant:switch-day" ledger row is
// skipped, so a partial run can simply be re-run. Sends no email.
//
// Run AFTER `npm run db:seed` — the seed is what puts monthlyMinutes on the
// plan rows, and a subscriber backfilled before it would get 0.
//
// Usage: tsx scripts/backfill-clip-minutes.ts [--dry-run]

const REASON = "grant:switch-day";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  const done = new Set(
    (await prisma.minuteTransaction.findMany({ where: { reason: REASON }, select: { userId: true }, distinct: ["userId"] }))
      .map((r) => r.userId),
  );

  const users = await prisma.user.findMany({
    select: {
      id: true,
      planId: true,
      subscriptionEndsAt: true,
      plan: { select: { kind: true, monthlyMinutes: true } },
    },
  });

  let subscribers = 0;
  let free = 0;
  let skipped = 0;
  let minutesGranted = 0;

  for (const u of users) {
    if (done.has(u.id)) { skipped++; continue; }

    const active = !!u.planId && u.plan?.kind === "subscription" && !!u.subscriptionEndsAt && u.subscriptionEndsAt > now;
    if (active) {
      const monthly = u.plan?.monthlyMinutes ?? 0;
      subscribers++;
      if (dryRun) { minutesGranted += monthly; continue; }
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: u.id }, data: { monthlyMinutes: monthly } });
        minutesGranted += await grantMonthlyMinutes({ userId: u.id, monthlyMinutes: monthly, reason: REASON, tx });
      });
    } else {
      free++;
      if (!dryRun) await grantFreeTierMinutes(u.id, REASON);
    }
  }

  const { FREE_TIER_MONTHLY_BONUS_MINUTES } = await import("../lib/plans/tiers");
  console.log(
    `${dryRun ? "[dry run] would grant" : "granted"}: ${subscribers} subscriber(s), ` +
    `${free} free user(s) (${FREE_TIER_MONTHLY_BONUS_MINUTES} min each); ` +
    `${minutesGranted} subscription minute(s); ${skipped} already done.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // lib/minutes pulls in the Redis client, whose open connection would
    // otherwise keep this one-shot script alive forever.
    process.exit();
  });
