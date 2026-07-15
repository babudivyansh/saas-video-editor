// Executive-dashboard metric computation. Five sections, each a pure-ish
// function over Prisma aggregates (never rows-into-JS for series — date
// bucketing happens in SQL). Results are Redis-cached by the route.
//
// Honesty rules: metrics we can't derive from stored data are returned as
// null with the UI labeling them "needs instrumentation" — never zeros
// pretending to be data. Proxies (DAU from lastLoginAt, churn from expiries)
// are named as proxies in the payload so the UI can label them.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { getSyncStats } from "@/lib/social/service";

export type MetricsSection = "kpis" | "revenue" | "ai" | "social" | "infra" | "growth";
export const METRIC_RANGES = [7, 30, 90] as const;

const DAY_MS = 86400_000;

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function kpisSection(rangeDays: number) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * DAY_MS);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const notRefunded = { status: { not: "refunded" } };

  const [subsByPlan, plans, revToday, revMtd, revPrevMonth, newUsers, dau, payingUsers, totalUsers, expired30d, activeSubs, revRange, purchasersRange, refunded, totalPurchases] =
    await Promise.all([
      prisma.user.groupBy({
        by: ["planId"],
        _count: true,
        where: { subscriptionEndsAt: { gt: now }, planId: { not: null } },
      }),
      prisma.plan.findMany({ where: { kind: "subscription" }, select: { id: true, priceInPaise: true, intervalMonths: true } }),
      prisma.purchase.aggregate({ _sum: { amountInPaise: true }, where: { ...notRefunded, createdAt: { gte: todayStart } } }),
      prisma.purchase.aggregate({ _sum: { amountInPaise: true }, where: { ...notRefunded, createdAt: { gte: mtdStart } } }),
      prisma.purchase.aggregate({ _sum: { amountInPaise: true }, where: { ...notRefunded, createdAt: { gte: prevMonthStart, lt: mtdStart } } }),
      prisma.user.count({ where: { createdAt: { gte: rangeStart } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(DISTINCT "userId") AS count FROM "Purchase"`,
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionEndsAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lte: now } } }),
      prisma.user.count({ where: { subscriptionEndsAt: { gt: now } } }),
      prisma.purchase.aggregate({ _sum: { amountInPaise: true }, where: { ...notRefunded, createdAt: { gte: rangeStart } } }),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(DISTINCT "userId") AS count FROM "Purchase" WHERE "createdAt" >= ${rangeStart}`,
      prisma.purchase.count({ where: { status: "refunded" } }),
      prisma.purchase.count(),
    ]);

  // MRR: each active subscriber contributes their plan's price normalized to
  // one month (a ₹2,997 3-month plan contributes ₹999/mo).
  const planById = new Map(plans.map((p) => [p.id, p]));
  let mrrInPaise = 0;
  for (const row of subsByPlan) {
    const plan = row.planId ? planById.get(row.planId) : undefined;
    if (!plan) continue; // pack plans / stale planIds contribute no recurring revenue
    mrrInPaise += Math.round((plan.priceInPaise / (plan.intervalMonths ?? 1)) * row._count);
  }

  const paying = Number(payingUsers[0]?.count ?? 0);
  const payersRange = Number(purchasersRange[0]?.count ?? 0);
  const revRangeSum = revRange._sum.amountInPaise ?? 0;
  const prevSum = revPrevMonth._sum.amountInPaise ?? 0;
  const mtdSum = revMtd._sum.amountInPaise ?? 0;

  return {
    mrrInPaise,
    arrInPaise: mrrInPaise * 12,
    activeSubscribers: activeSubs,
    revenueTodayInPaise: revToday._sum.amountInPaise ?? 0,
    revenueMtdInPaise: mtdSum,
    revenueGrowthPct: prevSum > 0 ? ((mtdSum - prevSum) / prevSum) * 100 : null,
    newUsers,
    dauProxy: dau, // logins in last 24h — login-based proxy, not activity
    conversionPct: totalUsers > 0 ? (paying / totalUsers) * 100 : null,
    churnProxyPct: expired30d + activeSubs > 0 ? (expired30d / (expired30d + activeSubs)) * 100 : null,
    arpuInPaise: payersRange > 0 ? Math.round(revRangeSum / payersRange) : null,
    refundRatePct: totalPurchases > 0 ? (refunded / totalPurchases) * 100 : null,
    totalUsers,
    // Not derivable — no marketing-spend or cohort-event data. UI renders
    // these as labeled "needs instrumentation" placeholders.
    cac: null,
    ltv: null,
  };
}

// ── Revenue ──────────────────────────────────────────────────────────────────
export async function revenueSection(rangeDays: number) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * DAY_MS);

  const [series, signupSeries, byPlan, byKind, creditsSold, creditsConsumed, affiliate] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; revenue: bigint; purchases: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             COALESCE(SUM("amountInPaise"), 0) AS revenue,
             COUNT(*) AS purchases
      FROM "Purchase"
      WHERE "createdAt" >= ${rangeStart} AND status <> 'refunded'
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; users: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS users
      FROM "User" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.purchase.groupBy({
      by: ["planId"],
      _sum: { amountInPaise: true },
      _count: true,
      where: { createdAt: { gte: rangeStart }, status: { not: "refunded" } },
    }),
    prisma.$queryRaw<Array<{ kind: string | null; revenue: bigint; purchases: bigint }>>`
      SELECT pl.kind AS kind, COALESCE(SUM(p."amountInPaise"),0) AS revenue, COUNT(*) AS purchases
      FROM "Purchase" p LEFT JOIN "Plan" pl ON pl.id = p."planId"
      WHERE p."createdAt" >= ${rangeStart} AND p.status <> 'refunded'
      GROUP BY 1`,
    prisma.purchase.aggregate({ _sum: { credits: true }, where: { createdAt: { gte: rangeStart }, status: { not: "refunded" } } }),
    prisma.generation.aggregate({ _sum: { creditsCost: true }, where: { createdAt: { gte: rangeStart }, status: "completed" } }),
    prisma.commission.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
  ]);

  const planNames = new Map(
    (await prisma.plan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );

  return {
    series: series.map((r) => ({ date: r.day.toISOString().slice(0, 10), revenueInPaise: Number(r.revenue), purchases: Number(r.purchases) })),
    signupSeries: signupSeries.map((r) => ({ date: r.day.toISOString().slice(0, 10), value: Number(r.users) })),
    byPlan: byPlan
      .map((p) => ({
        planName: p.planId ? (planNames.get(p.planId) ?? "Unknown") : "No plan",
        revenueInPaise: p._sum.amountInPaise ?? 0,
        purchases: p._count,
      }))
      .sort((a, b) => b.revenueInPaise - a.revenueInPaise),
    byKind: byKind.map((k) => ({ kind: k.kind ?? "unknown", revenueInPaise: Number(k.revenue), purchases: Number(k.purchases) })),
    creditsSold: creditsSold._sum.credits ?? 0,
    creditsConsumed: creditsConsumed._sum.creditsCost ?? 0,
    affiliate: affiliate.map((a) => ({ status: a.status, amount: a._sum.amount ?? 0, count: a._count })),
  };
}

// ── AI ───────────────────────────────────────────────────────────────────────
export async function aiSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [byTypeStatus, latency, cost, topModels, modelStatus, byTool] = await Promise.all([
    prisma.generation.groupBy({
      by: ["generationType", "status"],
      _count: true,
      where: { createdAt: { gte: rangeStart } },
    }),
    prisma.$queryRaw<Array<{ toolSlug: string; avg_seconds: number | null; n: bigint }>>`
      SELECT "toolSlug", AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))) AS avg_seconds, COUNT(*) AS n
      FROM "Generation"
      WHERE status = 'completed' AND "completedAt" IS NOT NULL AND "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY n DESC`,
    prisma.generation.aggregate({
      _sum: { estimatedCostUsd: true, creditsCost: true },
      _count: true,
      where: { createdAt: { gte: rangeStart }, estimatedCostUsd: { not: null } },
    }),
    prisma.generation.groupBy({
      by: ["modelId"],
      _count: true,
      _sum: { creditsCost: true, estimatedCostUsd: true },
      where: { createdAt: { gte: rangeStart }, modelId: { not: null } },
      orderBy: { _count: { modelId: "desc" } },
      take: 10,
    }),
    prisma.generation.groupBy({
      by: ["modelId", "status"],
      _count: true,
      where: { createdAt: { gte: rangeStart }, modelId: { not: null } },
    }),
    prisma.generation.groupBy({
      by: ["toolSlug"],
      _count: true,
      where: { createdAt: { gte: rangeStart } },
      orderBy: { _count: { toolSlug: "desc" } },
      take: 12,
    }),
  ]);

  const count = (status: string) => byTypeStatus.filter((r) => r.status === status).reduce((s, r) => s + r._count, 0);
  const completed = count("completed");
  const failed = count("failed");

  return {
    totalGenerations: byTypeStatus.reduce((s, r) => s + r._count, 0),
    byType: byTypeStatus,
    successRatePct: completed + failed > 0 ? (completed / (completed + failed)) * 100 : null,
    failed,
    avgLatencyByTool: latency.map((l) => ({ toolSlug: l.toolSlug, avgSeconds: l.avg_seconds !== null ? Number(l.avg_seconds) : null, count: Number(l.n) })),
    // "tracked tools only": estimatedCostUsd is populated by a subset of tools.
    trackedCost: {
      totalUsd: cost._sum.estimatedCostUsd ?? 0,
      creditsCost: cost._sum.creditsCost ?? 0,
      generations: cost._count,
    },
    topModels: topModels.map((m) => {
      const mine = modelStatus.filter((s) => s.modelId === m.modelId);
      const done = mine.find((s) => s.status === "completed")?._count ?? 0;
      const fail = mine.find((s) => s.status === "failed")?._count ?? 0;
      return {
        modelId: m.modelId,
        generations: m._count,
        creditsCost: m._sum.creditsCost ?? 0,
        costUsd: m._sum.estimatedCostUsd ?? null,
        errorRatePct: done + fail > 0 ? (fail / (done + fail)) * 100 : null,
      };
    }),
    byTool: byTool.map((t) => ({ toolSlug: t.toolSlug, generations: t._count })),
  };
}

// ── Social ───────────────────────────────────────────────────────────────────
export async function socialSection() {
  const staleCutoff = new Date(Date.now() - 24 * 3600_000);
  const [byProviderStatus, followers, posts, syncStats, stale] = await Promise.all([
    prisma.socialAccount.groupBy({ by: ["provider", "status"], _count: true }),
    prisma.socialAccount.aggregate({ _sum: { followers: true } }),
    prisma.socialPost.count(),
    getSyncStats().catch(() => ({ ok: 0, fail: 0 })),
    prisma.socialAccount.count({
      where: { status: "active", OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleCutoff } }] },
    }),
  ]);

  return {
    accounts: byProviderStatus,
    connectedTotal: byProviderStatus.reduce((s, r) => s + r._count, 0),
    needsReauth: byProviderStatus.filter((r) => r.status === "needs_reauth").reduce((s, r) => s + r._count, 0),
    followersTracked: followers._sum.followers ?? 0,
    postsSynced: posts,
    syncsToday: syncStats,
    staleOver24h: stale,
  };
}

// ── Infra ────────────────────────────────────────────────────────────────────
export async function infraSection() {
  const [dbOk, redisOk, queue] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
    renderQueueCounts(),
  ]);
  return {
    db: dbOk,
    redis: redisOk,
    renderQueue: queue,
    process: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptimeHours: Number((process.uptime() / 3600).toFixed(1)),
    },
  };
}

export async function renderQueueCounts(): Promise<Record<string, number> | null> {
  // Probe first: when Redis is down (common in dev), don't let BullMQ open a
  // connection that retries forever and floods the console with
  // ECONNREFUSED AggregateErrors.
  if (!(await redis.ping())) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const queue = new Queue("editor-render", {
      connection: {
        url: env.REDIS_URL || "redis://127.0.0.1:6379",
        retryStrategy: () => null, // one-shot read: fail fast, never reconnect-loop
        maxRetriesPerRequest: 1,
      },
    });
    const counts = await queue.getJobCounts("wait", "active", "completed", "failed", "delayed");
    await queue.close();
    return counts;
  } catch {
    return null; // queue not created yet / in-process driver — not an error
  }
}

// ── Growth (cohorts / coupons / affiliate funnel) ────────────────────────────
export async function growthSection() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [cohorts, topCoupons, referralFunnel, affiliateCount] = await Promise.all([
    // Signup-month cohorts with activation (made ≥1 generation, ever) and
    // paid conversion — honest lifetime flags, not time-windowed retention
    // (which needs event tracking we don't collect).
    prisma.$queryRaw<Array<{ month: Date; signups: bigint; activated: bigint; paid: bigint }>>`
      SELECT date_trunc('month', u."createdAt") AS month,
             COUNT(*) AS signups,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Generation" g WHERE g."userId" = u.id)) AS activated,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Purchase" p WHERE p."userId" = u.id)) AS paid
      FROM "User" u
      WHERE u."createdAt" >= ${sixMonthsAgo}
      GROUP BY 1 ORDER BY 1`,
    prisma.coupon.findMany({
      where: { timesRedeemed: { gt: 0 } },
      orderBy: { timesRedeemed: "desc" },
      take: 10,
      select: { code: true, timesRedeemed: true, discountType: true, discountValue: true, active: true },
    }),
    prisma.referral.groupBy({ by: ["status"], _count: true }),
    prisma.affiliate.count(),
  ]);

  const discountGiven = await prisma.couponRedemption.aggregate({ _sum: { discountInPaise: true } });
  const funnel = Object.fromEntries(referralFunnel.map((r) => [r.status, r._count]));
  const signedUp = (funnel.signed_up ?? 0) + (funnel.converted ?? 0);

  return {
    cohorts: cohorts.map((c) => ({
      month: c.month.toISOString().slice(0, 7),
      signups: Number(c.signups),
      activated: Number(c.activated),
      paid: Number(c.paid),
    })),
    coupons: {
      top: topCoupons,
      totalDiscountInPaise: discountGiven._sum.discountInPaise ?? 0,
    },
    affiliates: {
      count: affiliateCount,
      referrals: funnel,
      conversionPct: signedUp > 0 ? ((funnel.converted ?? 0) / signedUp) * 100 : null,
    },
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
export async function computeSection(section: MetricsSection, rangeDays: number) {
  switch (section) {
    case "kpis": return kpisSection(rangeDays);
    case "revenue": return revenueSection(rangeDays);
    case "ai": return aiSection(rangeDays);
    case "social": return socialSection();
    case "infra": return infraSection();
    case "growth": return growthSection();
  }
}
