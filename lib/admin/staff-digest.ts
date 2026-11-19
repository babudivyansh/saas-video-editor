// The 09:00 IST staff summary that replaces one email per signup
// (lib/admin/signup-alerts.ts, signupMode "daily"). Everything comes from
// tables the app already writes, so the numbers are the same ones the admin
// panel shows.
//
// The question it answers is "who got stuck", not just "who signed up":
// 138 signups → 24 AutoClip runs → 1 paid (2026-11-19) is an activation gap.

import { prisma } from "@/lib/prisma";
import type { AdminDailyDigestData } from "@/lib/email/templates/admin";

const DAY = 86_400_000;
export const AUTOCLIP = "auto-clip";
export const RUN_READY_STATUSES = ["ready", "completed"];
const MAX_LISTED_SIGNUPS = 30;
const MAX_LISTED_STUCK = 20;

export async function buildStaffDigest(now: Date): Promise<AdminDailyDigestData> {
  const since = new Date(now.getTime() - DAY);
  const stuckFrom = new Date(now.getTime() - 2 * DAY);

  const [signups, stuckCandidates, runsStarted, runsReady, failedRuns, payments, subEvents] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since, lt: now }, purgedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, hasPassword: true, intendedUse: true, signupReferrer: true, signupSource: true,
        projects: { where: { productType: AUTOCLIP }, select: { id: true }, take: 1 },
      },
    }),
    prisma.user.findMany({
      where: {
        createdAt: { gte: stuckFrom, lt: since },
        purgedAt: null,
        projects: { none: { productType: AUTOCLIP } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true },
    }),
    prisma.project.count({ where: { productType: AUTOCLIP, createdAt: { gte: since, lt: now } } }),
    prisma.project.count({
      where: { productType: AUTOCLIP, status: { in: RUN_READY_STATUSES }, updatedAt: { gte: since, lt: now } },
    }),
    prisma.project.findMany({
      where: { productType: AUTOCLIP, status: "failed", updatedAt: { gte: since, lt: now } },
      select: { failureReason: true },
    }),
    prisma.purchase.findMany({
      where: { createdAt: { gte: since, lt: now }, status: { not: "refunded" }, amountInPaise: { gt: 0 } },
      select: { userId: true, amountInPaise: true, currency: true },
    }),
    prisma.subscriptionEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since, lt: now }, type: { in: ["trial_started", "payment_failed", "halted", "cancelled"] } },
      _count: { _all: true },
    }),
  ]);

  // A first-time payer has no paid purchase before the window.
  const payerIds = [...new Set(payments.map((p) => p.userId))];
  const earlierPayers = payerIds.length
    ? await prisma.purchase.findMany({
        where: { userId: { in: payerIds }, createdAt: { lt: since }, amountInPaise: { gt: 0 } },
        select: { userId: true },
        distinct: ["userId"],
      })
    : [];
  const earlier = new Set(earlierPayers.map((p) => p.userId));

  const reasons = new Map<string, number>();
  for (const r of failedRuns) {
    const key = (r.failureReason ?? "No reason recorded").slice(0, 120);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const subCount = (t: string) => subEvents.find((e) => e.type === t)?._count._all ?? 0;

  return {
    dateLabel: now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }),
    signups: signups.length,
    signupsGoogle: signups.filter((s) => !s.hasPassword).length,
    startedAutoClip: signups.filter((s) => s.projects.length > 0).length,
    newSignups: signups.slice(0, MAX_LISTED_SIGNUPS).map((s) => ({
      userId: s.id,
      email: s.email,
      name: s.name,
      method: s.hasPassword ? ("email" as const) : ("google" as const),
      intendedUse: s.intendedUse,
      // The campaign's source when tagged, else the referring host.
      cameFrom: s.signupSource?.split("/")[0] || s.signupReferrer || null,
      startedAutoClip: s.projects.length > 0,
    })),
    moreSignups: Math.max(0, signups.length - MAX_LISTED_SIGNUPS),
    stuck: stuckCandidates.slice(0, MAX_LISTED_STUCK).map((u) => ({ userId: u.id, email: u.email })),
    stuckTotal: stuckCandidates.length,
    runsStarted,
    runsReady,
    runsFailed: failedRuns.length,
    topFailureReasons: [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count })),
    paymentsCount: payments.length,
    // INR only: a USD purchase's minor units aren't paise.
    revenueInPaise: payments.filter((p) => p.currency === "INR").reduce((sum, p) => sum + p.amountInPaise, 0),
    firstTimePayers: payerIds.filter((id) => !earlier.has(id)).length,
    trialsStarted: subCount("trial_started"),
    paymentFailures: subCount("payment_failed"),
    cancellations: subCount("cancelled") + subCount("halted"),
  };
}
