import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendFirstRunNudgeEmail,
  sendMinutesExpiringEmail,
  sendFirstVideoSuccessEmail,
  sendOnboardingDay1Email,
  sendOnboardingDay3Email,
  sendOnboardingDay7Email,
} from "@/lib/email";
import { shouldSendCategory } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { greetingName } from "@/lib/display-name";
import { withCronTracking } from "@/lib/cron-tracking";

// Hourly cron — drives the onboarding email sequence for new users.
//
//   GET /api/cron/onboarding
//   Authorization: Bearer <CRON_SECRET>
//
// 1 hour: "paste a link" nudge, worded for what the user makes, only if no
//         AutoClip run was started
// Day 1:  nudge, 24h after signup, only if no AutoClip run was started
// Day 3:  adaptive — "make them yours" if they have clips, else a second nudge
// Day 7:  upgrade prompt (free users only)
// Expiring: ~3 days before a free account's bonus Clip Minutes expire, if it
//         still has some (900 free minutes had expired unused, unannounced).
// First clips: the watermark → Pro-trial upsell, 2h+ after a free user's
//         first completed AutoClip run (moved here from lib/credit-events.ts,
//         which fired it on a CREDIT spend — AutoClip spends minutes, so most
//         users who got clips never received it).
//
// Activity used to be "credits < 10", which AutoClip never touches, and the
// "no activity" day-1 email had no activity check at all. Everything below
// reads AutoClip projects/clips instead.
//
// Runs hourly so the day-N emails land about N days after signup rather than
// at 09:00 UTC whatever the user's signup time; each step is guarded by its
// own *SentAt flag, so an hourly run never sends anything twice.

const AUTO_CLIP = "auto-clip";
/** How long after a first completed run before the upsell — it shouldn't land
 *  on top of the "your clips are ready" email. */
const FIRST_CLIPS_DELAY_MS = 2 * 60 * 60 * 1000;
/** Only users who signed up recently get the first-clips upsell, so shipping
 *  this doesn't email every old account that once ran AutoClip. */
const FIRST_CLIPS_MAX_ACCOUNT_AGE_DAYS = 30;
/** The first "paste a link" nudge goes this long after signup. */
const ACTIVATION_NUDGE_DELAY_MS = 60 * 60 * 1000;
/** The expiry reminder goes when the minutes have this long left. A 24-hour
 *  window, so an hourly run catches every account once. */
const EXPIRY_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const EXPIRY_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** AutoClip runs the user started (anything past an empty draft). */
function startedRuns(userId: string) {
  return prisma.project.count({ where: { userId, productType: AUTO_CLIP, status: { not: "draft" } } });
}

function readyClips(userId: string) {
  return prisma.clip.count({ where: { status: "ready", project: { userId, productType: AUTO_CLIP } } });
}

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { nudge: 0, day1: 0, day1Skipped: 0, day3: 0, day7: 0, expiring: 0, firstClips: 0, errors: 0 };

  function daysAgo(d: number) {
    return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  }

  // ── 1 hour: signed up 1–24h ago and never started a run ─────────────────
  // The first nudge, worded for what they said they make (welcome screen →
  // intendedUse). Most signups who never run AutoClip leave in the first
  // session, so a 24h-only reminder was too late.
  try {
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: daysAgo(1), lte: new Date(now.getTime() - ACTIVATION_NUDGE_DELAY_MS) },
        activationNudgeSentAt: null,
      },
      select: { id: true, email: true, name: true, minutes: true, intendedUse: true },
    });

    for (const u of users) {
      try {
        const started = (await startedRuns(u.id)) > 0;
        if (!started && (await shouldSendCategory(u.id, "productUpdates"))) {
          await sendFirstRunNudgeEmail(u.email, greetingName(u.name), u.minutes, u.intendedUse);
          results.nudge++;
        }
        await prisma.user.update({ where: { id: u.id }, data: { activationNudgeSentAt: now } });
      } catch (e) {
        logger.error("cron/onboarding", `nudge error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "nudge batch error", e);
  }

  // ── Day 1: signed up 24–48h ago and never started a run ─────────────────
  try {
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: daysAgo(2), lte: daysAgo(1) }, onboardingDay1SentAt: null },
      select: { id: true, email: true, name: true, minutes: true },
    });

    for (const u of users) {
      try {
        const started = (await startedRuns(u.id)) > 0;
        if (!started && (await shouldSendCategory(u.id, "productUpdates"))) {
          await sendOnboardingDay1Email(u.email, greetingName(u.name), u.minutes);
          results.day1++;
        } else {
          results.day1Skipped++;
        }
        await prisma.user.update({ where: { id: u.id }, data: { onboardingDay1SentAt: now } });
      } catch (e) {
        logger.error("cron/onboarding", `day1 error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "day1 batch error", e);
  }

  // ── Day 3 ─────────────────────────────────────────────────────────────────
  try {
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: daysAgo(4), lte: daysAgo(3) }, onboardingDay3SentAt: null },
      select: { id: true, email: true, name: true },
    });

    for (const u of users) {
      try {
        const clipCount = await readyClips(u.id);
        if (await shouldSendCategory(u.id, "productUpdates")) {
          await sendOnboardingDay3Email(u.email, greetingName(u.name), clipCount, clipCount > 0);
        }
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

  // ── Day 7: free users only ────────────────────────────────────────────────
  try {
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: daysAgo(8), lte: daysAgo(7) },
        onboardingDay7SentAt: null,
        planId: null, // don't send an upgrade nudge to already-paid users
      },
      select: { id: true, email: true, name: true, minutes: true },
    });

    for (const u of users) {
      try {
        if (await shouldSendCategory(u.id, "productUpdates")) {
          await sendOnboardingDay7Email(u.email, greetingName(u.name), u.minutes);
        }
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

  // ── Expiring free minutes ─────────────────────────────────────────────────
  // Free accounts only (no plan, or a plan that has ended): a subscriber's
  // bonus minutes are a small part of their balance. minutesExpiryReminderFor
  // holds the expiry date already reminded about, so a new monthly grant (a
  // new expiry date) gets its own reminder, and an hourly run never repeats.
  try {
    const from = new Date(now.getTime() + EXPIRY_REMINDER_LEAD_MS - EXPIRY_REMINDER_WINDOW_MS);
    const to = new Date(now.getTime() + EXPIRY_REMINDER_LEAD_MS);
    const users = await prisma.user.findMany({
      where: {
        bonusMinutes: { gt: 0 },
        bonusMinutesExpireAt: { gt: from, lte: to },
        role: "USER",
        purgedAt: null,
        deactivatedAt: null,
        OR: [{ planId: null }, { subscriptionEndsAt: null }, { subscriptionEndsAt: { lt: now } }],
      },
      select: {
        id: true, email: true, name: true, bonusMinutes: true, bonusMinutesExpireAt: true,
        minutesExpiryReminderFor: true, trialUsedAt: true,
        _count: { select: { purchases: { where: { status: "captured" } } } },
      },
    });

    for (const u of users) {
      const expiresAt = u.bonusMinutesExpireAt!;
      if (u.minutesExpiryReminderFor && u.minutesExpiryReminderFor.getTime() === expiresAt.getTime()) continue;
      try {
        if (await shouldSendCategory(u.id, "usageAlerts")) {
          const trialEligible = !u.trialUsedAt && u._count.purchases === 0;
          await sendMinutesExpiringEmail(u.email, greetingName(u.name), u.bonusMinutes, expiresAt, trialEligible);
          results.expiring++;
        }
        await prisma.user.update({ where: { id: u.id }, data: { minutesExpiryReminderFor: expiresAt } });
      } catch (e) {
        logger.error("cron/onboarding", `expiry reminder error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "expiry reminder batch error", e);
  }

  // ── First clips: watermark → Pro trial upsell ─────────────────────────────
  // firstVideoAt is the once-only guard, written only after a non-"failed"
  // send (a transient failure retries on the next hourly run). Paying and
  // trialing users are stamped without an email — there's nothing to sell.
  try {
    const users = await prisma.user.findMany({
      where: {
        firstVideoAt: null,
        createdAt: { gte: daysAgo(FIRST_CLIPS_MAX_ACCOUNT_AGE_DAYS) },
        projects: {
          some: {
            productType: AUTO_CLIP,
            status: "completed",
            updatedAt: { lte: new Date(now.getTime() - FIRST_CLIPS_DELAY_MS) },
          },
        },
      },
      select: { id: true, email: true, name: true, planId: true, trialEndsAt: true },
    });

    for (const u of users) {
      try {
        const trialing = !!u.trialEndsAt && u.trialEndsAt > now;
        if (u.planId || trialing) {
          await prisma.user.update({ where: { id: u.id }, data: { firstVideoAt: now } });
          continue;
        }
        const clipCount = await readyClips(u.id);
        if (clipCount === 0) continue; // completed run whose clips were since deleted — try a later run
        const delivered = await sendFirstVideoSuccessEmail(u.email, greetingName(u.name), clipCount).catch((e) => {
          logger.error("cron/onboarding", `first-clips email error for ${u.id}`, e);
          return false;
        });
        if (delivered) {
          await prisma.user.update({ where: { id: u.id }, data: { firstVideoAt: now } });
          results.firstClips++;
        }
      } catch (e) {
        logger.error("cron/onboarding", `first-clips error for ${u.id}`, e);
        results.errors++;
      }
    }
  } catch (e) {
    logger.error("cron/onboarding", "first-clips batch error", e);
  }

  return NextResponse.json({ ok: true, ...results, at: now.toISOString() });
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("onboarding", handleGET);
