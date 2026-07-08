import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOnboardingDay1Email, sendOnboardingDay3Email, sendOnboardingDay7Email } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Daily cron — drives the 3-email onboarding sequence for new users.
//
//   GET /api/cron/onboarding
//   Authorization: Bearer <CRON_SECRET>
//
// Day 1: No-activity nudge — fires 24h after signup if user hasn't spent credits
// Day 3: Feature discovery (adaptive: engaged vs inactive variant)
// Day 7: Upgrade prompt

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { day1: 0, day3: 0, day7: 0, errors: 0 };

  function daysAgo(d: number) {
    const t = new Date(now);
    t.setDate(t.getDate() - d);
    return t;
  }

  // ── Day 1: signed up ~24h ago ────────────────────────────────────────────
  try {
    const windowStart = daysAgo(2); // more than 1 day ago
    const windowEnd = daysAgo(1);   // less than 2 days ago

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        onboardingDay1SentAt: null,
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true },
    });

    for (const u of users) {
      try {
        await sendOnboardingDay1Email(u.email, u.firstName ?? u.name ?? "", u.credits);
        await prisma.user.update({ where: { id: u.id }, data: { onboardingDay1SentAt: now } });
        results.day1++;
      } catch (e) {
        logger.error("cron/onboarding", `day1 error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "day1 batch error", e);
  }

  // ── Day 3: signed up ~3 days ago ─────────────────────────────────────────
  try {
    const windowStart = daysAgo(4);
    const windowEnd = daysAgo(3);

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        onboardingDay3SentAt: null,
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true },
    });

    for (const u of users) {
      try {
        // credits started at 10; credits < 10 means they used some
        const creditsUsed = Math.max(0, 10 - u.credits);
        const hasUsed = creditsUsed > 0;
        await sendOnboardingDay3Email(u.email, u.firstName ?? u.name ?? "", creditsUsed, hasUsed);
        await prisma.user.update({ where: { id: u.id }, data: { onboardingDay3SentAt: now } });
        results.day3++;
      } catch (e) {
        logger.error("cron/onboarding", `day3 error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "day3 batch error", e);
  }

  // ── Day 7: signed up ~7 days ago ─────────────────────────────────────────
  try {
    const windowStart = daysAgo(8);
    const windowEnd = daysAgo(7);

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        onboardingDay7SentAt: null,
        planId: null, // don't send upgrade nudge to already-paid users
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true },
    });

    for (const u of users) {
      try {
        await sendOnboardingDay7Email(u.email, u.firstName ?? u.name ?? "", u.credits);
        await prisma.user.update({ where: { id: u.id }, data: { onboardingDay7SentAt: now } });
        results.day7++;
      } catch (e) {
        logger.error("cron/onboarding", `day7 error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "day7 batch error", e);
  }

  return NextResponse.json({ ok: true, ...results, at: now.toISOString() });
}
