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
import { KNOWN_RENDER_QUEUE_NAMES } from "@/lib/render-queue";
import { getCronRunStatuses, type CronName } from "@/lib/cron-tracking";

export type MetricsSection =
  | "kpis" | "revenue" | "ai" | "social" | "infra" | "growth"
  | "overview" | "top" | "activity";
export const METRIC_RANGES = [7, 30, 90, 365] as const;

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

// Daily revenue/refund/purchase buckets for an arbitrary window — shared by
// the main series, the compare-previous-period overlay, and KPI sparklines.
async function dailyRevenueSeries(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ day: Date; revenue: bigint; refunds: bigint; purchases: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           COALESCE(SUM("amountInPaise") FILTER (WHERE status <> 'refunded'), 0) AS revenue,
           COALESCE(SUM("amountInPaise") FILTER (WHERE status = 'refunded'), 0) AS refunds,
           COUNT(*) FILTER (WHERE status <> 'refunded') AS purchases
    FROM "Purchase"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    revenueInPaise: Number(r.revenue),
    refundsInPaise: Number(r.refunds),
    purchases: Number(r.purchases),
  }));
}

// ── Revenue ──────────────────────────────────────────────────────────────────
export async function revenueSection(rangeDays: number, compare = false) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * DAY_MS);
  const prevStart = new Date(rangeStart.getTime() - rangeDays * DAY_MS);

  const [series, previousSeries, signupSeries, byPlan, byKind, creditsSold, creditsConsumed, affiliate, couponDiscount] = await Promise.all([
    dailyRevenueSeries(rangeStart, now),
    compare ? dailyRevenueSeries(prevStart, rangeStart) : Promise.resolve(null),
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
    prisma.couponRedemption.aggregate({ _sum: { discountInPaise: true }, where: { createdAt: { gte: rangeStart } } }),
  ]);

  const planNames = new Map(
    (await prisma.plan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );

  const kindRevenue = (kind: string) => Number(byKind.find((k) => k.kind === kind)?.revenue ?? 0);
  const affiliatePaid = affiliate.find((a) => a.status === "paid")?._sum.amount ?? 0;
  const totalRevenue = series.reduce((s, r) => s + r.revenueInPaise, 0);
  const totalPurchases = series.reduce((s, r) => s + r.purchases, 0);

  return {
    series,
    previousSeries, // null unless ?compare=1
    signupSeries: signupSeries.map((r) => ({ date: r.day.toISOString().slice(0, 10), value: Number(r.users) })),
    byPlan: byPlan
      .map((p) => ({
        planName: p.planId ? (planNames.get(p.planId) ?? "Unknown") : "No plan",
        revenueInPaise: p._sum.amountInPaise ?? 0,
        purchases: p._count,
      }))
      .sort((a, b) => b.revenueInPaise - a.revenueInPaise),
    byKind: byKind.map((k) => ({ kind: k.kind ?? "unknown", revenueInPaise: Number(k.revenue), purchases: Number(k.purchases) })),
    // Revenue-sources donut. Affiliate payouts and coupon discounts are COSTS
    // shown alongside revenue slices for context, labeled as such in the UI.
    // No "enterprise" plan kind exists — deliberately absent, never faked.
    sources: [
      { name: "Subscriptions", inPaise: kindRevenue("subscription") },
      { name: "Credit packs", inPaise: kindRevenue("pack") },
      { name: "Affiliate payouts", inPaise: Math.round(affiliatePaid * 100), isCost: true },
      { name: "Coupon discounts", inPaise: couponDiscount._sum.discountInPaise ?? 0, isCost: true },
    ],
    aovInPaise: totalPurchases > 0 ? Math.round(totalRevenue / totalPurchases) : null,
    creditsSold: creditsSold._sum.credits ?? 0,
    creditsConsumed: creditsConsumed._sum.creditsCost ?? 0,
    affiliate: affiliate.map((a) => ({ status: a.status, amount: a._sum.amount ?? 0, count: a._count })),
  };
}

// ── AI ───────────────────────────────────────────────────────────────────────
export async function aiSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [byTypeStatus, latency, cost, topModels, modelStatus, byTool, topCostUsersRaw] = await Promise.all([
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
    prisma.generation.groupBy({
      by: ["userId"],
      _sum: { estimatedCostUsd: true, creditsCost: true },
      _count: true,
      where: { createdAt: { gte: rangeStart }, estimatedCostUsd: { not: null } },
      orderBy: { _sum: { estimatedCostUsd: "desc" } },
      take: 10,
    }),
  ]);

  // Cost per provider over ALL generations in range (modelId null = tools
  // without a registry model → their researched per-run cost groups as "other").
  const costByModelAll = await prisma.generation.groupBy({
    by: ["modelId"],
    _sum: { estimatedCostUsd: true },
    _count: true,
    where: { createdAt: { gte: rangeStart }, estimatedCostUsd: { not: null } },
  });

  const count = (status: string) => byTypeStatus.filter((r) => r.status === status).reduce((s, r) => s + r._count, 0);
  const completed = count("completed");
  const failed = count("failed");

  // modelId → provider from the static registries (code-side join).
  const { IMAGE_MODELS } = await import("@/lib/models/imageModels");
  const { VIDEO_MODELS } = await import("@/lib/models/videoModels");
  const providerOf = new Map<string, string>(
    [...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => [m.id, m.provider]),
  );
  const costByProvider = new Map<string, { costUsd: number; generations: number }>();
  for (const m of costByModelAll) {
    const provider = m.modelId ? (providerOf.get(m.modelId) ?? "other") : "other";
    const entry = costByProvider.get(provider) ?? { costUsd: 0, generations: 0 };
    entry.costUsd += m._sum.estimatedCostUsd ?? 0;
    entry.generations += m._count;
    costByProvider.set(provider, entry);
  }

  const costUsers = await prisma.user.findMany({
    where: { id: { in: topCostUsersRaw.map((u) => u.userId) } },
    select: { id: true, email: true, name: true },
  });
  const costUserById = new Map(costUsers.map((u) => [u.id, u]));

  return {
    statusTotals: {
      completed,
      failed,
      cancelled: count("cancelled"),
      refunded: count("refunded"),
      pending: count("pending"),
    },
    costByProvider: [...costByProvider.entries()]
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd),
    topCostUsers: topCostUsersRaw.map((u) => ({
      userId: u.userId,
      email: costUserById.get(u.userId)?.email ?? "(deleted)",
      name: costUserById.get(u.userId)?.name ?? null,
      costUsd: u._sum.estimatedCostUsd ?? 0,
      creditsCost: u._sum.creditsCost ?? 0,
      generations: u._count,
    })),
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

// Expected cadence per known cron (SETUP.md §7's schedule). A job whose last
// recorded run is older than this — or that has never run at all — counts as
// stale for the Dashboard alert. This is what surfaces a scheduler lapse on
// the main admin screen instead of only being visible by drilling into the
// Ops page's own cron list, which is how a 14-day production lapse of every
// single cron job went unnoticed.
const CRON_STALE_AFTER_SEC: Record<CronName, number> = {
  "asset-cleanup": 3600, // every 15 min
  "stale-clip-sweep": 3600, // every 15 min
  "clip-publish": 3600, // every 10 min
  "social-refresh": 3 * 3600, // hourly snapshot refresh
  "refill-credits": 36 * 3600,
  "commission-payout": 36 * 3600,
  "account-purge": 36 * 3600,
  onboarding: 36 * 3600,
  "review-drip": 36 * 3600,
  "review-prompts": 36 * 3600,
  "subscription-reminder": 36 * 3600,
  "admin-digest": 9 * 24 * 3600, // weekly
  reengagement: 9 * 24 * 3600, // weekly
};

async function staleCronCount(): Promise<number> {
  const statuses = await getCronRunStatuses();
  return statuses.filter(
    (s) => s.ageSeconds === null || s.ageSeconds > CRON_STALE_AFTER_SEC[s.name],
  ).length;
}

// ── Infra ────────────────────────────────────────────────────────────────────
export async function infraSection() {
  const [dbOk, redisOk, queue, staleCrons] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
    renderQueueCounts(),
    staleCronCount(),
  ]);
  return {
    db: dbOk,
    redis: redisOk,
    renderQueue: queue,
    staleCronCount: staleCrons,
    process: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptimeHours: Number((process.uptime() / 3600).toFixed(1)),
    },
  };
}

export async function renderQueueCounts(): Promise<Record<string, Record<string, number>> | null> {
  // Probe first: when Redis is down (common in dev), don't let BullMQ open a
  // connection that retries forever and floods the console with
  // ECONNREFUSED AggregateErrors.
  if (!(await redis.ping())) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const connection = {
      url: env.REDIS_URL || "redis://127.0.0.1:6379",
      retryStrategy: () => null, // one-shot read: fail fast, never reconnect-loop
      maxRetriesPerRequest: 1,
    };
    // Previously hardcoded to editor-render only — a dead/never-started
    // worker for any of the other 8 queues (e.g. auto-clip-rerender, behind
    // the Studio & Insights "stuck at Queued" bug) was invisible here.
    const entries = await Promise.all(KNOWN_RENDER_QUEUE_NAMES.map(async (name) => {
      const queue = new Queue(name, { connection });
      try {
        return [name, await queue.getJobCounts("wait", "active", "completed", "failed", "delayed")] as const;
      } finally {
        await queue.close();
      }
    }));
    return Object.fromEntries(entries);
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

// ── Overview (Row-1 KPI cards: kpis + sparklines + AI cost/margin proxy) ─────
export async function overviewSection(rangeDays: number) {
  const now = new Date();
  const sparkStart = new Date(now.getTime() - 30 * DAY_MS);

  const [kpis, revenueSpark, signupSpark, genSpark, aiCost, revenueRange] = await Promise.all([
    kpisSection(rangeDays),
    dailyRevenueSeries(sparkStart, now),
    prisma.$queryRaw<Array<{ day: Date; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS n
      FROM "User" WHERE "createdAt" >= ${sparkStart} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; n: bigint; credits: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS n,
             COALESCE(SUM("creditsCost"), 0) AS credits
      FROM "Generation" WHERE "createdAt" >= ${sparkStart} GROUP BY 1 ORDER BY 1`,
    prisma.generation.aggregate({
      _sum: { estimatedCostUsd: true },
      where: { createdAt: { gte: new Date(now.getTime() - rangeDays * DAY_MS) }, estimatedCostUsd: { not: null } },
    }),
    prisma.purchase.aggregate({
      _sum: { amountInPaise: true },
      where: { createdAt: { gte: new Date(now.getTime() - rangeDays * DAY_MS) }, status: { not: "refunded" } },
    }),
  ]);

  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    ...kpis,
    aiCostUsd: aiCost._sum.estimatedCostUsd ?? 0,
    // Margin proxy: revenue vs tracked provider cost, deliberately currency-
    // separate (₹ revenue, $ cost) — the UI labels it, never a fake percent.
    revenueRangeInPaise: revenueRange._sum.amountInPaise ?? 0,
    sparklines: {
      revenue: revenueSpark.map((r) => ({ date: r.date, value: r.revenueInPaise })),
      signups: signupSpark.map((r) => ({ date: day(r.day), value: Number(r.n) })),
      generations: genSpark.map((r) => ({ date: day(r.day), value: Number(r.n) })),
      creditsConsumed: genSpark.map((r) => ({ date: day(r.day), value: Number(r.credits) })),
    },
  };
}

// ── Top lists (Row 8) ────────────────────────────────────────────────────────
export async function topSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [creditUsersRaw, revenueUsersRaw, recentPurchases, countries, devices, firstLoginEvent] = await Promise.all([
    prisma.generation.groupBy({
      by: ["userId"],
      _sum: { creditsCost: true },
      _count: true,
      where: { createdAt: { gte: rangeStart } },
      orderBy: { _sum: { creditsCost: "desc" } },
      take: 10,
    }),
    prisma.purchase.groupBy({
      by: ["userId"],
      _sum: { amountInPaise: true },
      _count: true,
      where: { status: { not: "refunded" } },
      orderBy: { _sum: { amountInPaise: "desc" } },
      take: 10,
    }),
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, amountInPaise: true, credits: true, status: true, createdAt: true,
        user: { select: { id: true, email: true, name: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.loginEvent.groupBy({ by: ["country"], _count: true, where: { country: { not: null } }, orderBy: { _count: { country: "desc" } }, take: 8 }),
    prisma.loginEvent.groupBy({ by: ["device"], _count: true, where: { device: { not: null } }, orderBy: { _count: { device: "desc" } }, take: 8 }),
    prisma.loginEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const ids = [...new Set([...creditUsersRaw.map((u) => u.userId), ...revenueUsersRaw.map((u) => u.userId)])];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const label = (id: string) => byId.get(id)?.name || byId.get(id)?.email || "(deleted)";

  return {
    topCreditUsers: creditUsersRaw.map((u) => ({
      userId: u.userId, label: label(u.userId), credits: u._sum.creditsCost ?? 0, generations: u._count,
    })),
    topRevenueUsers: revenueUsersRaw.map((u) => ({
      userId: u.userId, label: label(u.userId), revenueInPaise: u._sum.amountInPaise ?? 0, purchases: u._count,
    })),
    recentPurchases,
    // Login analytics accrue from the LoginEvent deploy — the UI shows since-when.
    countries: countries.map((c) => ({ label: c.country as string, count: c._count })),
    devices: devices.map((d) => ({ label: d.device as string, count: d._count })),
    loginDataSince: firstLoginEvent?.createdAt ?? null,
  };
}

// ── Activity feed (Row 9) ────────────────────────────────────────────────────
// Recent events merged from real tables — no synthetic events. Support
// tickets: no model exists, deliberately absent.
export interface ActivityEvent {
  kind: "user" | "purchase" | "refund" | "generation_failed" | "admin" | "coupon";
  at: string;
  title: string;
  href?: string;
}

export async function activitySection() {
  const PER_SOURCE = 12;
  const [newUsers, purchases, failedGens, adminActions, redemptions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, email: true, name: true, createdAt: true },
    }),
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, amountInPaise: true, status: true, createdAt: true, user: { select: { id: true, email: true } }, plan: { select: { name: true } } },
    }),
    prisma.generation.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, toolSlug: true, modelId: true, createdAt: true, userId: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, action: true, targetId: true, createdAt: true },
    }),
    prisma.couponRedemption.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, discountInPaise: true, createdAt: true, coupon: { select: { code: true } } },
    }),
  ]);

  const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
  const events: ActivityEvent[] = [
    ...newUsers.map((u) => ({
      kind: "user" as const,
      at: u.createdAt.toISOString(),
      title: `${u.name || u.email} signed up`,
      href: `/admin/users/${u.id}`,
    })),
    ...purchases.map((p) => ({
      kind: p.status === "refunded" ? ("refund" as const) : ("purchase" as const),
      at: p.createdAt.toISOString(),
      title: `${p.user?.email ?? "?"} ${p.status === "refunded" ? "refunded" : "purchased"} ${p.plan?.name ?? "credits"} (${inr(p.amountInPaise)})`,
      href: "/admin/purchases",
    })),
    ...failedGens.map((g) => ({
      kind: "generation_failed" as const,
      at: g.createdAt.toISOString(),
      title: `Generation failed: ${g.toolSlug}${g.modelId ? ` · ${g.modelId}` : ""}`,
      href: `/admin/users/${g.userId}`,
    })),
    ...adminActions.map((a) => ({
      kind: "admin" as const,
      at: a.createdAt.toISOString(),
      title: `Admin: ${a.action}${a.targetId ? ` → ${a.targetId.slice(0, 12)}…` : ""}`,
      href: "/admin/audit",
    })),
    ...redemptions.map((r) => ({
      kind: "coupon" as const,
      at: r.createdAt.toISOString(),
      title: `Coupon ${r.coupon.code} redeemed (−${inr(r.discountInPaise)})`,
      href: "/admin/coupons",
    })),
  ];

  return { events: events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40) };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
export async function computeSection(section: MetricsSection, rangeDays: number, compare = false) {
  switch (section) {
    case "kpis": return kpisSection(rangeDays);
    case "overview": return overviewSection(rangeDays);
    case "revenue": return revenueSection(rangeDays, compare);
    case "ai": return aiSection(rangeDays);
    case "social": return socialSection();
    case "infra": return infraSection();
    case "growth": return growthSection();
    case "top": return topSection(rangeDays);
    case "activity": return activitySection();
  }
}
