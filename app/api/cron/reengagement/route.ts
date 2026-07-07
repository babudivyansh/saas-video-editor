import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReengagement7DayEmail, sendReengagement30DayEmail, sendUnusedCreditsReminderEmail } from "@/lib/email";

// Weekly cron — re-engages inactive users and sends mid-month unused-credits reminders.
//
//   GET /api/cron/reengagement
//   Authorization: Bearer <CRON_SECRET>
//
// 7-day: users who haven't logged in for 7–14 days
// 30-day: users who haven't logged in for 30+ days (win-back)
// Unused credits: active subscribers who've used <20% of monthly credits (runs on 15th of month)

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { reengaged7d: 0, reengaged30d: 0, unusedCredits: 0, errors: 0 };

  function daysAgo(d: number) {
    const t = new Date(now);
    t.setDate(t.getDate() - d);
    return t;
  }

  // ── 7-day inactive ───────────────────────────────────────────────────────
  try {
    const users = await prisma.user.findMany({
      where: {
        lastLoginAt: { gte: daysAgo(14), lte: daysAgo(7) },
        OR: [
          { reengagementSentAt: null },
          { reengagementSentAt: { lte: daysAgo(30) } }, // allow re-send after 30 days
        ],
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true },
    });

    for (const u of users) {
      try {
        await sendReengagement7DayEmail(u.email, u.firstName ?? u.name ?? "", u.credits);
        await prisma.user.update({ where: { id: u.id }, data: { reengagementSentAt: now } });
        results.reengaged7d++;
      } catch (e) {
        console.error("[cron/reengagement] 7d error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/reengagement] 7d batch error", e);
  }

  // ── 30-day inactive win-back ─────────────────────────────────────────────
  try {
    const users = await prisma.user.findMany({
      where: {
        lastLoginAt: { lte: daysAgo(30) },
        OR: [
          { reengagementSentAt: null },
          { reengagementSentAt: { lte: daysAgo(30) } },
        ],
      },
      select: { id: true, email: true, firstName: true, name: true, credits: true, lastLoginAt: true },
    });

    for (const u of users) {
      try {
        const daysSince = u.lastLoginAt
          ? Math.floor((now.getTime() - u.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
          : 30;
        await sendReengagement30DayEmail(u.email, u.firstName ?? u.name ?? "", u.credits, daysSince);
        await prisma.user.update({ where: { id: u.id }, data: { reengagementSentAt: now } });
        results.reengaged30d++;
      } catch (e) {
        console.error("[cron/reengagement] 30d error for", u.id, e);
        results.errors++;
      }
    }
  } catch (e) {
    console.error("[cron/reengagement] 30d batch error", e);
  }

  // ── Unused credits (only on 15th of the month) ───────────────────────────
  if (now.getDate() === 15) {
    try {
      const users = await prisma.user.findMany({
        where: {
          planId: { not: null },             // active subscriber
          nextRefillAt: { not: null },       // multi-month sub
          subscriptionEndsAt: { gt: now },   // still active
          monthlyCredits: { gt: 0 },
        },
        select: { id: true, email: true, firstName: true, name: true, credits: true, monthlyCredits: true, nextRefillAt: true },
      });

      for (const u of users) {
        try {
          // Only send if they've used less than 20% of their monthly allocation
          const usedPercent = (u.monthlyCredits - u.credits) / u.monthlyCredits;
          if (usedPercent < 0.2 && u.credits > 0) {
            await sendUnusedCreditsReminderEmail(
              u.email,
              u.firstName ?? u.name ?? "",
              u.credits,
              u.nextRefillAt!,
            );
            results.unusedCredits++;
          }
        } catch (e) {
          console.error("[cron/reengagement] unused-credits error for", u.id, e);
          results.errors++;
        }
      }
    } catch (e) {
      console.error("[cron/reengagement] unused-credits batch error", e);
    }
  }

  return NextResponse.json({ ok: true, ...results, at: now.toISOString() });
}
