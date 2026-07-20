import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits";
import { sendCreditsRefilledEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Monthly credit refill for active multi-month subscriptions, plus expiry of
// lapsed terms. Intended to be hit by a scheduled trigger (cron) once an hour
// or once a day. Protect with CRON_SECRET so it can't be invoked by anyone.
//
//   GET /api/cron/refill-credits   (Authorization: Bearer <CRON_SECRET>)
//
// For each user whose nextRefillAt is due and whose term is still active, grant
// monthlyCredits and advance nextRefillAt by one month (until it passes the
// term end). For each user whose term has ended, clear the subscription state.
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let refilled = 0;
  let expired = 0;

  // ── 1. Grant due monthly refills ────────────────────────────────────────────
  // Runs BEFORE expiry: nextRefillAt is always set strictly inside the paid
  // term, so a due refill is one the user paid for even if the cron fires late
  // and the term has since lapsed. Expiring first would null nextRefillAt and
  // silently swallow that final paid refill.
  const due = await prisma.user.findMany({
    where: { nextRefillAt: { not: null, lte: now } },
    select: { id: true, monthlyCredits: true, nextRefillAt: true, subscriptionEndsAt: true },
  });

  for (const u of due) {
    const grant = u.monthlyCredits ?? 0;

    // Advance nextRefillAt by one month; null it out once it would pass term end.
    const next = new Date(u.nextRefillAt!);
    next.setMonth(next.getMonth() + 1);
    const nextRefillAt = u.subscriptionEndsAt && next >= u.subscriptionEndsAt ? null : next;

    await grantCredits({ userId: u.id, bucket: "subscription", amount: grant, reason: "grant:refill" });
    const updated = await prisma.user.update({
      where: { id: u.id },
      data: { nextRefillAt, lowCreditEmailSentAt: null },
      select: { email: true, firstName: true, name: true, credits: true },
    });

    // ── Credits refill notification (non-fatal) ────────────────────
    sendCreditsRefilledEmail(
      updated.email,
      updated.firstName ?? updated.name ?? "",
      grant,
      updated.credits,
    ).catch((e) => logger.error("cron/refill-credits", `email error for ${u.id}`, e));

    refilled++;
  }

  // ── 2. Expire lapsed subscriptions ──────────────────────────────────────────
  const lapsed = await prisma.user.findMany({
    where: { subscriptionEndsAt: { not: null, lte: now } },
    select: { id: true },
  });
  for (const u of lapsed) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        planId: null,
        subscriptionId: null,
        subscriptionEndsAt: null,
        nextRefillAt: null,
        monthlyCredits: 0,
        // Credits already granted are left as-is (they don't expire).
      },
    });
    expired++;
  }

  return NextResponse.json({ ok: true, refilled, expired, at: now.toISOString() });
}
