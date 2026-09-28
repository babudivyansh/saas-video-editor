import "dotenv/config";
import { prisma } from "../lib/prisma";
import { sendClipMinutesLaunchEmail } from "../lib/email";
import { FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_MONTHLY_BONUS_MINUTES } from "../lib/plans/tiers";
import { greetingName } from "@/lib/display-name";

// Switch-day email for the Clip Minutes model (2026-09-26 pricing plan, Stage 6).
//
// DRY RUN BY DEFAULT — it prints who would get what and sends nothing. Pass
// --send to actually email people. Order on switch day:
//
//   1. deploy, prisma migrate deploy
//   2. npm run db:seed                         (plan minutes, new credit grants)
//   3. tsx scripts/backfill-clip-minutes.ts    (everyone's first minutes)
//   4. tsx scripts/send-clip-minutes-announcement.ts            (dry run: check it)
//   5. tsx scripts/send-clip-minutes-announcement.ts --send
//
// Idempotent: anyone with a "clip-minutes-launch" EmailLog row that went out
// (sent / delivered / dev-logged) is skipped, so a run that dies half-way can
// simply be run again. --limit N caps one run, e.g. to send a first batch and
// watch bounces before sending the rest.
//
// The email is transactional (a service change owed to paying subscribers), so
// marketing opt-outs do not apply — but hard-bounced / complained addresses are
// still suppressed by lib/email/send.ts.

const TEMPLATE = "clip-minutes-launch";
const SENT = ["sent", "delivered", "dev-logged"];

type Tier = "free" | "creator" | "pro" | "studio";

async function main() {
  const send = process.argv.includes("--send");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10)) : Infinity;
  const now = new Date();

  const already = new Set(
    (await prisma.emailLog.findMany({
      where: { templateId: TEMPLATE, status: { in: SENT } },
      select: { recipient: true },
    })).map((r) => r.recipient.toLowerCase()),
  );

  const users = await prisma.user.findMany({
    select: {
      email: true, name: true,
      minutes: true, monthlyMinutes: true, monthlyCredits: true, subscriptionEndsAt: true,
      plan: { select: { tier: true, kind: true, monthlyCredits: true, monthlyMinutes: true } },
    },
  });

  let queued = 0;
  let skipped = 0;
  const byTier: Record<string, number> = {};

  for (const u of users) {
    if (queued >= limit) break;
    if (!u.email || already.has(u.email.toLowerCase())) { skipped++; continue; }

    const active = u.plan?.kind === "subscription" && !!u.subscriptionEndsAt && u.subscriptionEndsAt > now;
    const tier: Tier = active ? ((u.plan?.tier as Tier | null) ?? "free") : "free";
    const props = tier === "free"
      ? {
          name: greetingName(u.name),
          tier,
          monthlyMinutes: FREE_TIER_MONTHLY_BONUS_MINUTES,
          minutesBalance: u.minutes,
          newMonthlyCredits: FREE_TIER_MONTHLY_BONUS_CREDITS,
          currentMonthlyCredits: FREE_TIER_MONTHLY_BONUS_CREDITS,
          renewsAt: null,
        }
      : {
          name: greetingName(u.name),
          tier,
          monthlyMinutes: u.plan?.monthlyMinutes ?? u.monthlyMinutes,
          minutesBalance: u.minutes,
          newMonthlyCredits: u.plan?.monthlyCredits ?? u.monthlyCredits,
          // What they receive today — grandfathered until the next renewal.
          currentMonthlyCredits: u.monthlyCredits,
          renewsAt: u.subscriptionEndsAt,
        };

    byTier[tier] = (byTier[tier] ?? 0) + 1;
    queued++;
    if (send) {
      const r = await sendClipMinutesLaunchEmail(u.email, props);
      if (r.status === "failed") console.error(`failed: ${u.email}`);
    }
  }

  console.log(
    `${send ? "Sent" : "[dry run] would send"} ${queued} email(s) — ` +
    Object.entries(byTier).map(([t, n]) => `${t}: ${n}`).join(", ") +
    ` — ${skipped} skipped (already sent or no email).` +
    (send ? "" : " Re-run with --send to send."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // lib/email pulls in Redis; its open connection would keep this alive.
    process.exit();
  });
