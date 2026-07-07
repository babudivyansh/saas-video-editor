import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendSubscriptionExpiryWarningEmail,
  sendSubscriptionExpiredEmail,
} from "@/lib/email";

// Daily cron — fires subscription expiry warnings (7d, 3d, 1d before) and
// "subscription expired" emails the day after expiry.
//
//   GET /api/cron/subscription-reminder
//   Authorization: Bearer <CRON_SECRET>
//
// Set expiryReminderSentAt to the threshold string ("7d","3d","1d","expired")
// so each user gets at most one email per threshold per subscription term.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { warned7d: 0, warned3d: 0, warned1d: 0, expired: 0, errors: 0 };

  // ── Helper: days from now ────────────────────────────────────────────────
  function daysFromNow(d: number) {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    return t;
  }

  // ── 1. 7-day warning ─────────────────────────────────────────────────────
  try {
    const target = daysFromNow(7);
    const windowStart = new Date(target); windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(target);   windowEnd.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: {
        subscriptionEndsAt: { gte: windowStart, lte: windowEnd },
        NOT: { expiryReminderSentAt: { equals: new Date("2000-01-07") } }, // placeholder, use string tracking below
      },
      select: { id: true, email: true, firstName: true, name: true, subscriptionEndsAt: true, planId: true, expiryReminderSentAt: true },
    });

    for (const u of users) {
      // Skip if we already sent the 7d warning (sentAt stored as day offset marker)
      const sentMarker = u.expiryReminderSentAt?.toISOString().slice(0, 10);
      const targetMarker = windowStart.toISOString().slice(0, 10);
      if (sentMarker === targetMarker) continue;

      try {
        const plan = u.planId ? await prisma.plan.findUnique({ where: { id: u.planId }, select: { name: true } }) : null;
        await sendSubscriptionExpiryWarningEmail(
          u.email,
          u.firstName ?? u.name ?? "",
          plan?.name ?? "Pro",
          7,
          u.subscriptionEndsAt!,
        );
        await prisma.user.update({ where: { id: u.id }, data: { expiryReminderSentAt: windowStart } });
        results.warned7d++;
      } catch (e) {
        console.error("[cron/sub-reminder] 7d error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/sub-reminder] 7d batch error", e);
  }

  // ── 2. 3-day warning ─────────────────────────────────────────────────────
  try {
    const target = daysFromNow(3);
    const windowStart = new Date(target); windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(target);   windowEnd.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: { subscriptionEndsAt: { gte: windowStart, lte: windowEnd } },
      select: { id: true, email: true, firstName: true, name: true, subscriptionEndsAt: true, planId: true, expiryReminderSentAt: true },
    });

    for (const u of users) {
      const sentMarker = u.expiryReminderSentAt?.toISOString().slice(0, 10);
      const targetMarker = windowStart.toISOString().slice(0, 10);
      if (sentMarker === targetMarker) continue;

      try {
        const plan = u.planId ? await prisma.plan.findUnique({ where: { id: u.planId }, select: { name: true } }) : null;
        await sendSubscriptionExpiryWarningEmail(
          u.email,
          u.firstName ?? u.name ?? "",
          plan?.name ?? "Pro",
          3,
          u.subscriptionEndsAt!,
        );
        await prisma.user.update({ where: { id: u.id }, data: { expiryReminderSentAt: windowStart } });
        results.warned3d++;
      } catch (e) {
        console.error("[cron/sub-reminder] 3d error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/sub-reminder] 3d batch error", e);
  }

  // ── 3. 1-day warning ─────────────────────────────────────────────────────
  try {
    const target = daysFromNow(1);
    const windowStart = new Date(target); windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(target);   windowEnd.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: { subscriptionEndsAt: { gte: windowStart, lte: windowEnd } },
      select: { id: true, email: true, firstName: true, name: true, subscriptionEndsAt: true, planId: true, expiryReminderSentAt: true },
    });

    for (const u of users) {
      const sentMarker = u.expiryReminderSentAt?.toISOString().slice(0, 10);
      const targetMarker = windowStart.toISOString().slice(0, 10);
      if (sentMarker === targetMarker) continue;

      try {
        const plan = u.planId ? await prisma.plan.findUnique({ where: { id: u.planId }, select: { name: true } }) : null;
        await sendSubscriptionExpiryWarningEmail(
          u.email,
          u.firstName ?? u.name ?? "",
          plan?.name ?? "Pro",
          1,
          u.subscriptionEndsAt!,
        );
        await prisma.user.update({ where: { id: u.id }, data: { expiryReminderSentAt: windowStart } });
        results.warned1d++;
      } catch (e) {
        console.error("[cron/sub-reminder] 1d error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/sub-reminder] 1d batch error", e);
  }

  // ── 4. Expired yesterday ──────────────────────────────────────────────────
  try {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // These users had subscriptionEndsAt in the past — the refill-credits cron
    // has already cleared their sub. Find users who expired recently.
    const expiredUsers = await prisma.user.findMany({
      where: {
        subscriptionEndsAt: null,                // already cleared by refill-cron
        expiryReminderSentAt: { gte: yesterday, lte: yesterdayEnd }, // last reminder was sent yesterday
        planId: null,                             // plan cleared
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true, expiryReminderSentAt: true },
    });

    for (const u of expiredUsers) {
      try {
        await sendSubscriptionExpiredEmail(u.email, u.firstName ?? u.name ?? "", "Pro", u.credits);
        // Clear the marker so it won't fire again
        await prisma.user.update({ where: { id: u.id }, data: { expiryReminderSentAt: null } });
        results.expired++;
      } catch (e) {
        console.error("[cron/sub-reminder] expired email error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/sub-reminder] expired batch error", e);
  }

  return NextResponse.json({ ok: true, ...results, at: now.toISOString() });
}
