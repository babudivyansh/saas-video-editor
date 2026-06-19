import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Monthly credit refill for active multi-month subscriptions, plus expiry of
// lapsed terms. Intended to be hit by a scheduled trigger (cron) once an hour
// or once a day. Protect with CRON_SECRET so it can't be invoked by anyone.
//
//   GET /api/cron/refill-credits   (Authorization: Bearer <CRON_SECRET>)
//
// For each user whose nextRefillAt is due and whose term is still active, grant
// monthlyCredits and advance nextRefillAt by one month (until it passes the
// term end). For each user whose term has ended, clear the subscription state
// and revoke Veo3 access.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  let refilled = 0;
  let expired = 0;

  // ── 1. Expire lapsed subscriptions ──────────────────────────────────────────
  const lapsed = await prisma.user.findMany({
    where: { subscriptionEndsAt: { not: null, lte: now } },
    select: { id: true },
  });
  for (const u of lapsed) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        subscriptionId: null,
        subscriptionEndsAt: null,
        nextRefillAt: null,
        monthlyCredits: 0,
        veo3Enabled: false,
        // Credits already granted are left as-is (they don't expire).
      },
    });
    expired++;
  }

  // ── 2. Grant due monthly refills for still-active terms ─────────────────────
  const due = await prisma.user.findMany({
    where: {
      nextRefillAt: { not: null, lte: now },
      subscriptionEndsAt: { gt: now },
    },
    select: { id: true, monthlyCredits: true, nextRefillAt: true, subscriptionEndsAt: true },
  });

  for (const u of due) {
    const grant = u.monthlyCredits ?? 0;

    // Advance nextRefillAt by one month; null it out once it would pass term end.
    const next = new Date(u.nextRefillAt!);
    next.setMonth(next.getMonth() + 1);
    const nextRefillAt = u.subscriptionEndsAt && next >= u.subscriptionEndsAt ? null : next;

    const updated = await prisma.user.update({
      where: { id: u.id },
      data: { credits: { increment: grant }, nextRefillAt },
      select: { credits: true },
    });
    await redis.set(`credits:${u.id}`, String(updated.credits), "EX", 3600);
    refilled++;
  }

  return NextResponse.json({ ok: true, refilled, expired, at: now.toISOString() });
}
