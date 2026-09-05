// Daily capture of recurring revenue, so MRR can be plotted over time.
//
// kpisSection() can only ever report MRR *right now* — it reads live
// subscription state. This module writes that reading down once a day, which
// is the only way a history can exist. See prisma/schema.prisma MrrSnapshot
// for why there is no backfill.

import { prisma } from "@/lib/prisma";

const DAY_MS = 86400_000;

export interface MrrReading {
  mrrInPaise: number;
  activeSubscribers: number;
  planBreakdown: Record<string, { name: string; subscribers: number; mrrInPaise: number }>;
}

/** MRR as of right now, using the same derivation as kpisSection: each active
 *  subscriber contributes their plan's price normalised to one month. */
export async function computeMrrNow(now = new Date()): Promise<MrrReading> {
  const [subsByPlan, plans] = await Promise.all([
    prisma.user.groupBy({
      by: ["planId"],
      _count: true,
      where: { subscriptionEndsAt: { gt: now }, planId: { not: null } },
    }),
    prisma.plan.findMany({
      where: { kind: "subscription" },
      select: { id: true, name: true, priceInPaise: true, intervalMonths: true },
    }),
  ]);

  const planById = new Map(plans.map((p) => [p.id, p]));
  const planBreakdown: MrrReading["planBreakdown"] = {};
  let mrrInPaise = 0;
  let activeSubscribers = 0;

  for (const row of subsByPlan) {
    const plan = row.planId ? planById.get(row.planId) : undefined;
    // Pack plans and stale planIds contribute no recurring revenue, but the
    // users are still active subscribers — count them as such.
    activeSubscribers += row._count;
    if (!plan) continue;
    const monthly = Math.round((plan.priceInPaise / (plan.intervalMonths ?? 1)) * row._count);
    mrrInPaise += monthly;
    planBreakdown[plan.id] = { name: plan.name, subscribers: row._count, mrrInPaise: monthly };
  }

  return { mrrInPaise, activeSubscribers, planBreakdown };
}

/** Subscription movement within a UTC day, from the event log. */
async function movementFor(dayStart: Date) {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const rows = await prisma.subscriptionEvent.groupBy({
    by: ["type"],
    _count: true,
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const n = (type: string) => rows.find((r) => r.type === type)?._count ?? 0;
  return {
    newSubs: n("activated"),
    churnedSubs: n("cancelled") + n("halted"),
    reactivatedSubs: n("resumed"),
  };
}

/** Idempotent: one row per UTC day, upserted on capturedAt. Safe to run more
 *  than once a day — a re-run overwrites that day's reading rather than
 *  appending, so a retried cron cannot double-count. */
export async function captureMrrSnapshot(now = new Date()) {
  const capturedAt = new Date(now);
  capturedAt.setUTCHours(0, 0, 0, 0);

  const [reading, movement] = await Promise.all([computeMrrNow(now), movementFor(capturedAt)]);

  const data = {
    mrrInPaise: reading.mrrInPaise,
    activeSubscribers: reading.activeSubscribers,
    planBreakdown: reading.planBreakdown,
    source: "live",
    ...movement,
  };

  await prisma.mrrSnapshot.upsert({
    where: { capturedAt },
    create: { capturedAt, ...data },
    update: data,
  });

  return { capturedAt: capturedAt.toISOString().slice(0, 10), ...data };
}

/** History for the dashboard chart. Returns [] until the cron has run — the
 *  UI keeps its placeholder rather than drawing a line through one point. */
export async function mrrHistory(rangeDays: number) {
  const from = new Date(Date.now() - rangeDays * DAY_MS);
  from.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.mrrSnapshot.findMany({
    where: { capturedAt: { gte: from } },
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true, mrrInPaise: true, activeSubscribers: true,
      newSubs: true, churnedSubs: true, reactivatedSubs: true, source: true,
    },
  });

  return rows.map((r) => ({
    date: r.capturedAt.toISOString().slice(0, 10),
    mrrInPaise: r.mrrInPaise,
    arrInPaise: r.mrrInPaise * 12,
    activeSubscribers: r.activeSubscribers,
    newSubs: r.newSubs,
    churnedSubs: r.churnedSubs,
    reactivatedSubs: r.reactivatedSubs,
    source: r.source,
  }));
}
