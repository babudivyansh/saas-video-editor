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
import { getSyncStats } from "@/lib/social/service";
import { listQueues } from "./queues";
import { getCronRunStatuses, type CronRunId } from "@/lib/cron-tracking";
import { getCronPauses } from "@/lib/cron-dispatch";
import { runIdForPath } from "@/lib/cron-catalog";
import { mrrHistory } from "./mrr-snapshot";
import { Prisma } from "@prisma/client";
import { getFxConfig, getPlanPriceMinor } from "@/lib/currency";
import { formatMoney, parseCurrency } from "@/lib/currency-shared";

// ── Money across currencies ──────────────────────────────────────────────────
// Purchase.amountInPaise is MINOR UNITS OF Purchase.currency — paise for INR,
// cents for USD. Every revenue sum here used to add the raw column across
// currencies, so a $29 payment (2900 cents) was counted as ₹29. Totals are now
// INR-equivalent (USD converted at the admin-editable fx_rates row), and the
// USD share is reported alongside so the UI can say how much of it was dollars.
// Individual payments keep their own currency and are formatted in it.

async function inrPerUsd(): Promise<number> {
  return (await getFxConfig()).inrPerUsd;
}

/** INR-paise SQL expression for a Purchase row, optionally table-aliased. */
function inrPaiseSql(fx: number, alias?: string): Prisma.Sql {
  const col = (c: string) => Prisma.raw(alias ? `${alias}."${c}"` : `"${c}"`);
  return Prisma.sql`(CASE WHEN ${col("currency")} = 'USD' THEN ROUND(${col("amountInPaise")} * ${fx}::float8) ELSE ${col("amountInPaise")} END)`;
}

export interface CurrencySplit {
  /** Whole total in INR paise, USD converted at `fx`. */
  inrEquivPaise: number;
  /** The USD part, unconverted, in cents. */
  usdCents: number;
  usdCount: number;
}

/** Purchase revenue matching `where`, split by currency and normalised to INR. */
async function revenueSplit(where: Prisma.PurchaseWhereInput, fx: number): Promise<CurrencySplit> {
  // Two aggregates rather than a groupBy: anything that isn't USD is paise
  // (the column defaults to INR), so "not USD" is the INR bucket.
  const [nonUsd, usd] = await Promise.all([
    prisma.purchase.aggregate({ _sum: { amountInPaise: true }, where: { AND: [where, { currency: { not: "USD" } }] } }),
    prisma.purchase.aggregate({ _sum: { amountInPaise: true }, _count: { _all: true }, where: { AND: [where, { currency: "USD" }] } }),
  ]);
  const inrPaise = nonUsd?._sum?.amountInPaise ?? 0;
  const usdCents = usd?._sum?.amountInPaise ?? 0;
  return { inrEquivPaise: inrPaise + Math.round(usdCents * fx), usdCents, usdCount: usd?._count?._all ?? 0 };
}

export type MetricsSection =
  | "kpis" | "revenue" | "ai" | "social" | "infra" | "growth"
  | "overview" | "top" | "activity"
  // NOTE: this list and the z.enum in lib/admin/schemas.ts's metricsQuerySchema
  // are separate and BOTH have to change when a section is added.
  | "lifecycle" | "credits" | "minutes" | "pipeline" | "acquisition";
const DAY_MS = 86400_000;

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function kpisSection(rangeDays: number) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * DAY_MS);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const notRefunded = { status: { not: "refunded" } };

  const fx = await inrPerUsd();
  const [subsByPlan, plans, revToday, revMtd, revPrevMonth, newUsers, dau, payingUsers, totalUsers, expired30d, activeSubs, revRange, purchasersRange, refunded, totalPurchases] =
    await Promise.all([
      // By billing currency too: a USD subscriber pays the USD price book
      // ($29), not the INR plan price converted back.
      prisma.user.groupBy({
        by: ["planId", "subscriptionCurrency"],
        _count: true,
        where: { subscriptionEndsAt: { gt: now }, planId: { not: null } },
      }),
      prisma.plan.findMany({ where: { kind: "subscription" }, select: { id: true, slug: true, priceInPaise: true, intervalMonths: true } }),
      revenueSplit({ ...notRefunded, createdAt: { gte: todayStart } }, fx),
      revenueSplit({ ...notRefunded, createdAt: { gte: mtdStart } }, fx),
      revenueSplit({ ...notRefunded, createdAt: { gte: prevMonthStart, lt: mtdStart } }, fx),
      prisma.user.count({ where: { createdAt: { gte: rangeStart } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(DISTINCT "userId") AS count FROM "Purchase"`,
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionEndsAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lte: now } } }),
      prisma.user.count({ where: { subscriptionEndsAt: { gt: now } } }),
      revenueSplit({ ...notRefunded, createdAt: { gte: rangeStart } }, fx),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(DISTINCT "userId") AS count FROM "Purchase" WHERE "createdAt" >= ${rangeStart}`,
      prisma.purchase.count({ where: { status: "refunded" } }),
      prisma.purchase.count(),
    ]);

  // MRR: each active subscriber contributes their plan's price normalized to
  // one month (a ₹2,997 3-month plan contributes ₹999/mo). USD subscribers
  // contribute the USD price they actually pay, converted to INR.
  const planById = new Map(plans.map((p) => [p.id, p]));
  let mrrInPaise = 0;
  let mrrUsdCents = 0;
  for (const row of subsByPlan) {
    const plan = row.planId ? planById.get(row.planId) : undefined;
    if (!plan) continue; // pack plans / stale planIds contribute no recurring revenue
    const months = plan.intervalMonths ?? 1;
    if (parseCurrency(row.subscriptionCurrency) === "USD") {
      const cents = (await getPlanPriceMinor(plan.slug, plan.priceInPaise, "USD")) / months * row._count;
      mrrUsdCents += Math.round(cents);
      mrrInPaise += Math.round(cents * fx);
    } else {
      mrrInPaise += Math.round((plan.priceInPaise / months) * row._count);
    }
  }

  const paying = Number(payingUsers[0]?.count ?? 0);
  const payersRange = Number(purchasersRange[0]?.count ?? 0);
  const revRangeSum = revRange.inrEquivPaise;
  const prevSum = revPrevMonth.inrEquivPaise;
  const mtdSum = revMtd.inrEquivPaise;

  return {
    mrrInPaise,
    mrrUsdCents,
    arrInPaise: mrrInPaise * 12,
    activeSubscribers: activeSubs,
    revenueTodayInPaise: revToday.inrEquivPaise,
    revenueMtdInPaise: mtdSum,
    revenueGrowthPct: prevSum > 0 ? ((mtdSum - prevSum) / prevSum) * 100 : null,
    newUsers,
    dauProxy: dau, // logins in last 24h — login-based proxy, not activity
    conversionPct: totalUsers > 0 ? (paying / totalUsers) * 100 : null,
    churnProxyPct: expired30d + activeSubs > 0 ? (expired30d / (expired30d + activeSubs)) * 100 : null,
    arpuInPaise: payersRange > 0 ? Math.round(revRangeSum / payersRange) : null,
    refundRatePct: totalPurchases > 0 ? (refunded / totalPurchases) * 100 : null,
    totalUsers,
    /** INR per 1 USD used for every INR-equivalent total in this payload. */
    fxInrPerUsd: fx,
    /** The USD part of the range revenue, unconverted. */
    revenueRangeUsdCents: revRange.usdCents,
    revenueRangeUsdCount: revRange.usdCount,
    // Not derivable — no marketing-spend or cohort-event data. UI renders
    // these as labeled "needs instrumentation" placeholders.
    cac: null,
    ltv: null,
  };
}

// Daily revenue/refund/purchase buckets for an arbitrary window — shared by
// the main series, the compare-previous-period overlay, and KPI sparklines.
async function dailyRevenueSeries(from: Date, to: Date, fx: number) {
  const amount = inrPaiseSql(fx);
  const rows = await prisma.$queryRaw<Array<{ day: Date; revenue: bigint; refunds: bigint; purchases: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           COALESCE(SUM(${amount}) FILTER (WHERE status <> 'refunded'), 0) AS revenue,
           COALESCE(SUM(${amount}) FILTER (WHERE status = 'refunded'), 0) AS refunds,
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
  const fx = await inrPerUsd();

  const [series, previousSeries, signupSeries, byPlan, byKind, creditsSold, creditsConsumed, affiliate, couponDiscount, mrrSeries] = await Promise.all([
    dailyRevenueSeries(rangeStart, now, fx),
    compare ? dailyRevenueSeries(prevStart, rangeStart, fx) : Promise.resolve(null),
    prisma.$queryRaw<Array<{ day: Date; users: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS users
      FROM "User" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ planId: string | null; revenue: bigint; purchases: bigint }>>`
      SELECT "planId", COALESCE(SUM(${inrPaiseSql(fx)}),0) AS revenue, COUNT(*) AS purchases
      FROM "Purchase"
      WHERE "createdAt" >= ${rangeStart} AND status <> 'refunded'
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ kind: string | null; revenue: bigint; purchases: bigint }>>`
      SELECT pl.kind AS kind, COALESCE(SUM(${inrPaiseSql(fx, "p")}),0) AS revenue, COUNT(*) AS purchases
      FROM "Purchase" p LEFT JOIN "Plan" pl ON pl.id = p."planId"
      WHERE p."createdAt" >= ${rangeStart} AND p.status <> 'refunded'
      GROUP BY 1`,
    prisma.purchase.aggregate({ _sum: { credits: true }, where: { createdAt: { gte: rangeStart }, status: { not: "refunded" } } }),
    prisma.generation.aggregate({ _sum: { creditsCost: true }, where: { createdAt: { gte: rangeStart }, status: "completed" } }),
    prisma.commission.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
    prisma.couponRedemption.aggregate({ _sum: { discountInPaise: true }, where: { createdAt: { gte: rangeStart } } }),
    // Empty until the mrr-snapshot cron has run at least twice — the UI keeps
    // its placeholder rather than drawing a line through a single point.
    mrrHistory(rangeDays),
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
    byPlan: (Array.isArray(byPlan) ? byPlan : [])
      .filter((p) => p.revenue !== undefined)
      .map((p) => ({
        planName: p.planId ? (planNames.get(p.planId) ?? "Unknown") : "No plan",
        revenueInPaise: Number(p.revenue),
        purchases: Number(p.purchases),
      }))
      .sort((a, b) => b.revenueInPaise - a.revenueInPaise),
    byKind: byKind.map((k) => ({ kind: k.kind ?? "unknown", revenueInPaise: Number(k.revenue), purchases: Number(k.purchases) })),
    // Revenue-sources donut. Affiliate payouts and coupon discounts are COSTS
    // shown alongside revenue slices for context, labeled as such in the UI.
    // No "enterprise" plan kind exists — deliberately absent, never faked.
    sources: [
      { name: "Subscriptions", inPaise: kindRevenue("subscription") },
      { name: "Credit packs", inPaise: kindRevenue("pack") },
      { name: "Minute packs", inPaise: kindRevenue("minute_pack") },
      { name: "Affiliate payouts", inPaise: Math.round(affiliatePaid * 100), isCost: true },
      { name: "Coupon discounts", inPaise: couponDiscount._sum.discountInPaise ?? 0, isCost: true },
    ],
    aovInPaise: totalPurchases > 0 ? Math.round(totalRevenue / totalPurchases) : null,
    creditsSold: creditsSold._sum.credits ?? 0,
    creditsConsumed: creditsConsumed._sum.creditsCost ?? 0,
    affiliate: affiliate.map((a) => ({ status: a.status, amount: a._sum.amount ?? 0, count: a._count })),
    mrrSeries,
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

  // modelId → provider from the static registry (code-side join).
  const { IMAGE_MODELS } = await import("@/lib/models/imageModels");
  const providerOf = new Map<string, string>(
    IMAGE_MODELS.map((m) => [m.id, m.provider]),
  );
  const costByProvider = new Map<string, { costUsd: number; generations: number }>();
  for (const m of costByModelAll) {
    const provider = m.modelId ? (providerOf.get(m.modelId) ?? "other") : "other";
    const entry = costByProvider.get(provider) ?? { costUsd: 0, generations: 0 };
    entry.costUsd += m._sum.estimatedCostUsd ?? 0;
    entry.generations += m._count;
    costByProvider.set(provider, entry);
  }

  // Clip Minutes (2026-09-26 model): AutoClip's meter. Spent vs refunded in
  // range, from the minutes ledger — the counterpart of creditsCost above.
  const [minutesSpent, minutesRefunded] = await Promise.all([
    prisma.minuteTransaction.aggregate({
      _sum: { delta: true },
      _count: true,
      where: { createdAt: { gte: rangeStart }, reason: { startsWith: "spend:" } },
    }),
    prisma.minuteTransaction.aggregate({
      _sum: { delta: true },
      where: { createdAt: { gte: rangeStart }, reason: { startsWith: "refund:" } },
    }),
  ]);
  const { TOOL_COSTS } = await import("@/lib/tool-costs");
  const spentMinutes = -(minutesSpent._sum.delta ?? 0);
  const refundedMinutes = minutesRefunded._sum.delta ?? 0;
  const netMinutes = Math.max(0, spentMinutes - refundedMinutes);

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
    clipMinutes: {
      spent: spentMinutes,
      refunded: refundedMinutes,
      net: netMinutes,
      spends: minutesSpent._count,
      // Audited cost per source minute (lib/tool-costs.ts). An estimate: the
      // RunPod face-tracking share is still to be checked against an invoice.
      estCostUsd: netMinutes * (TOOL_COSTS["auto-clip"]?.costUsd ?? 0),
    },
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
const CRON_STALE_AFTER_SEC: Record<CronRunId, number> = {
  "asset-cleanup:orphans": 3600, // every 15 min
  "asset-cleanup:retention": 30 * 3600, // nightly
  "stale-clip-sweep": 3600, // every 15 min
  "email-maintenance": 30 * 60, // every 5 min — retries, provider probes, alerts
  "email-campaigns": 30 * 60, // every 2 min — campaign batches (no-op with nothing sending)
  "dub-sweep": 600, // every 2 min — the primary dub-completion path until webhooks are confirmed, see lib/cron/dub-sweep.ts
  "clip-publish": 3600, // every 10 min
  // social-refresh is tracked per ?job=, not per route — see KNOWN_CRON_JOBS.
  // Five of these had never run in production while the route's own heartbeat
  // read healthy, because the hourly default job was refreshing it.
  "social-refresh:refresh": 3 * 3600, // hourly snapshot refresh
  "social-refresh:retention": 9 * 24 * 3600, // weekly
  "social-refresh:digest": 9 * 24 * 3600, // weekly
  "social-refresh:daily-metrics": 30 * 3600, // nightly; a gap is a permanent hole in the history
  "social-refresh:scores": 30 * 3600, // nightly — viral/ai/health scores render as "—" without it
  "social-refresh:goals": 30 * 3600, // nightly, right after scores
  "social-refresh:reports": 30 * 3600, // daily
  "social-refresh:recalibrate-virality": 9 * 24 * 3600, // weekly
  "refill-credits": 36 * 3600,
  "commission-payout": 36 * 3600,
  "account-purge": 36 * 3600,
  onboarding: 36 * 3600,
  "review-drip": 36 * 3600,
  "review-prompts": 36 * 3600,
  "subscription-reminder": 36 * 3600,
  "admin-digest": 9 * 24 * 3600, // weekly
  "admin-daily-digest": 36 * 3600, // daily, 09:00 IST
  reengagement: 9 * 24 * 3600, // weekly
  "feature-announcements": 36 * 3600, // daily
  // A missed day is a permanent hole in the MRR series — nothing can fill it
  // in afterwards — so this is flagged stale sooner than the other dailies.
  "mrr-snapshot": 30 * 3600,
  "voice-library-sync": 36 * 3600, // nightly — hides withdrawn Voice Library voices
};

// Judged on the last SUCCESS, not the last run: a cron that runs on time and
// fails every time is as broken as one that never runs. A cron whose most
// recent run failed counts too, even if an earlier success is still recent.
// A job an admin paused on purpose isn't stale — it's off.
async function staleCronCount(): Promise<number> {
  const [statuses, pauses] = await Promise.all([getCronRunStatuses(), getCronPauses()]);
  const paused = new Set([...pauses.keys()].map(runIdForPath));
  return statuses.filter(
    (s) => !paused.has(s.name) && (s.failing || s.successAgeSeconds === null || s.successAgeSeconds > CRON_STALE_AFTER_SEC[s.name]),
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
    // Summed: the Dashboard reads `.failed` off this. It was the per-queue map
    // (every key a queue name), so that alert and health dot never fired.
    renderQueue: sumQueueCounts(queue),
    staleCronCount: staleCrons,
    process: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptimeHours: Number((process.uptime() / 3600).toFixed(1)),
    },
  };
}

/**
 * Per-queue job counts for every known queue, from whichever driver is live
 * (lib/admin/queues.ts). Null when BullMQ's Redis is unreachable. Previously
 * this read BullMQ only, so under the in-process driver — production's — it
 * reported all zeros no matter what was queued or failing.
 */
export async function renderQueueCounts(): Promise<Record<string, Record<string, number>> | null> {
  const queues = await listQueues();
  return queues ? Object.fromEntries(queues.map((q) => [q.name, q.counts])) : null;
}

/** Counts summed across every queue — what the Dashboard's queue health reads. */
function sumQueueCounts(perQueue: Record<string, Record<string, number>> | null): Record<string, number> | null {
  if (!perQueue) return null;
  const total: Record<string, number> = {};
  for (const counts of Object.values(perQueue)) {
    for (const [k, v] of Object.entries(counts)) total[k] = (total[k] ?? 0) + v;
  }
  return total;
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
             -- Activated = used an AI tool OR started an AutoClip run. Generation
             -- alone missed every AutoClip user (AutoClip writes Projects, not
             -- Generations), which is most of them.
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Generation" g WHERE g."userId" = u.id)
                                 OR EXISTS (SELECT 1 FROM "Project" pr WHERE pr."userId" = u.id AND pr."productType" = 'auto-clip')) AS activated,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Purchase" p WHERE p."userId" = u.id AND p."amountInPaise" > 0)) AS paid
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

  const fx = await inrPerUsd();
  const [kpis, revenueSpark, signupSpark, genSpark, aiCost, revenueRange, minuteSpark] = await Promise.all([
    kpisSection(rangeDays),
    dailyRevenueSeries(sparkStart, now, fx),
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
    revenueSplit({ createdAt: { gte: new Date(now.getTime() - rangeDays * DAY_MS) }, status: { not: "refunded" } }, fx),
    // Clip Minutes consumed per day (spends net of refunds) — AutoClip's
    // meter, which the credits sparkline above can never see.
    prisma.$queryRaw<Array<{ day: Date; minutes: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM(-delta), 0) AS minutes
      FROM "MinuteTransaction"
      WHERE "createdAt" >= ${sparkStart} AND (reason LIKE 'spend:%' OR reason LIKE 'refund%')
      GROUP BY 1 ORDER BY 1`,
  ]);

  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    ...kpis,
    aiCostUsd: aiCost._sum.estimatedCostUsd ?? 0,
    // Margin proxy: revenue vs tracked provider cost, deliberately currency-
    // separate (₹ revenue, $ cost) — the UI labels it, never a fake percent.
    revenueRangeInPaise: revenueRange.inrEquivPaise,
    sparklines: {
      revenue: revenueSpark.map((r) => ({ date: r.date, value: r.revenueInPaise })),
      signups: signupSpark.map((r) => ({ date: day(r.day), value: Number(r.n) })),
      generations: genSpark.map((r) => ({ date: day(r.day), value: Number(r.n) })),
      creditsConsumed: genSpark.map((r) => ({ date: day(r.day), value: Number(r.credits) })),
      minutesConsumed: (Array.isArray(minuteSpark) ? minuteSpark : [])
        .filter((r) => r.day instanceof Date)
        .map((r) => ({ date: day(r.day), value: Math.max(0, Number(r.minutes)) })),
    },
  };
}

// ── Top lists (Row 8) ────────────────────────────────────────────────────────
export async function topSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);
  const fx = await inrPerUsd();

  const [creditUsersRaw, revenueUsersRaw, recentPurchases, countries, devices, firstLoginEvent, minuteUsersRaw] = await Promise.all([
    prisma.generation.groupBy({
      by: ["userId"],
      _sum: { creditsCost: true },
      _count: true,
      where: { createdAt: { gte: rangeStart } },
      orderBy: { _sum: { creditsCost: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ userId: string; revenue: bigint; purchases: bigint }>>`
      SELECT "userId", COALESCE(SUM(${inrPaiseSql(fx)}), 0) AS revenue, COUNT(*) AS purchases
      FROM "Purchase" WHERE status <> 'refunded'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, amountInPaise: true, currency: true, credits: true, minutes: true, status: true, createdAt: true,
        user: { select: { id: true, email: true, name: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.loginEvent.groupBy({ by: ["country"], _count: true, where: { country: { not: null } }, orderBy: { _count: { country: "desc" } }, take: 8 }),
    prisma.loginEvent.groupBy({ by: ["device"], _count: true, where: { device: { not: null } }, orderBy: { _count: { device: "desc" } }, take: 8 }),
    prisma.loginEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Clip Minutes consumed per user in range, net of refunds.
    prisma.$queryRaw<Array<{ userId: string; minutes: bigint; runs: bigint }>>`
      SELECT "userId", SUM(-delta) AS minutes,
             COUNT(*) FILTER (WHERE reason LIKE 'spend:%') AS runs
      FROM "MinuteTransaction"
      WHERE "createdAt" >= ${rangeStart} AND (reason LIKE 'spend:%' OR reason LIKE 'refund%')
      GROUP BY 1 HAVING SUM(-delta) > 0 ORDER BY 2 DESC LIMIT 10`,
  ]);

  const revenueUsers = Array.isArray(revenueUsersRaw) ? revenueUsersRaw.filter((u) => typeof u.userId === "string") : [];
  const minuteUsers = Array.isArray(minuteUsersRaw) ? minuteUsersRaw.filter((u) => typeof u.userId === "string") : [];
  const ids = [...new Set([...creditUsersRaw.map((u) => u.userId), ...revenueUsers.map((u) => u.userId), ...minuteUsers.map((u) => u.userId)])];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const label = (id: string) => byId.get(id)?.name || byId.get(id)?.email || "(deleted)";

  return {
    topCreditUsers: creditUsersRaw.map((u) => ({
      userId: u.userId, label: label(u.userId), credits: u._sum.creditsCost ?? 0, generations: u._count,
    })),
    topRevenueUsers: revenueUsers.map((u) => ({
      userId: u.userId, label: label(u.userId), revenueInPaise: Number(u.revenue), purchases: Number(u.purchases),
    })),
    topMinuteUsers: minuteUsers.map((u) => ({
      userId: u.userId, label: label(u.userId), minutes: Number(u.minutes), runs: Number(u.runs),
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
      select: { id: true, amountInPaise: true, currency: true, status: true, createdAt: true, user: { select: { id: true, email: true } }, plan: { select: { name: true } } },
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
      title: `${p.user?.email ?? "?"} ${p.status === "refunded" ? "refunded" : "purchased"} ${p.plan?.name ?? "credits"} (${formatMoney(p.amountInPaise, parseCurrency(p.currency) ?? "INR")})`,
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

// ── Dense-day helper ─────────────────────────────────────────────────────────
// SQL GROUP BY only emits days that HAVE rows, so a quiet Tuesday silently
// disappears and the line chart draws straight through it as though nothing
// happened. Every series below is filled against the full range first.
function denseDays(rangeDays: number): string[] {
  const out: string[] = [];
  const start = new Date(Date.now() - rangeDays * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i <= rangeDays; i++) {
    out.push(new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

function fill<T extends Record<string, number>>(
  rangeDays: number,
  rows: Array<{ date: string } & Partial<T>>,
  zero: T,
): Array<{ date: string } & T> {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return denseDays(rangeDays).map((date) => ({ date, ...zero, ...(byDate.get(date) ?? {}) }) as { date: string } & T);
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// ── Subscription lifecycle ───────────────────────────────────────────────────
// SubscriptionEvent has been written on every Razorpay webhook since it landed
// but has never been read by the admin panel. It is the only real churn signal
// in the schema — churnProxyPct above is inferred from expiry dates.
export async function lifecycleSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [daily, totals, firstEvent] = await Promise.all([
    prisma.$queryRaw<Array<{ d: Date; type: string; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, type, COUNT(*) AS n
      FROM "SubscriptionEvent" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.subscriptionEvent.groupBy({
      by: ["type"],
      _count: true,
      where: { createdAt: { gte: rangeStart } },
    }),
    prisma.subscriptionEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const perDay = new Map<string, Record<string, number>>();
  for (const r of daily) {
    const key = day(r.d);
    const row = perDay.get(key) ?? {};
    row[r.type] = Number(r.n);
    perDay.set(key, row);
  }
  const series = fill(
    rangeDays,
    [...perDay.entries()].map(([date, v]) => ({ date, ...v })),
    { activated: 0, charged: 0, payment_failed: 0, cancelled: 0, paused: 0, resumed: 0, halted: 0, pending: 0 },
  );

  const n = (type: string) => totals.find((t) => t.type === type)?._count ?? 0;
  const failed = n("payment_failed");

  return {
    series,
    churnVsReactivation: series.map((r) => ({
      date: r.date,
      churned: r.cancelled + r.paused,
      reactivated: r.resumed + r.activated,
    })),
    // Dunning is a real funnel: a failed charge moves to pending retry, then
    // either recovers (a later `charged`) or halts and cancels.
    dunning: [
      { name: "Payment failed", value: failed },
      { name: "Retry pending", value: n("pending") },
      { name: "Halted", value: n("halted") },
      { name: "Cancelled", value: n("cancelled") },
    ],
    totals: Object.fromEntries(totals.map((t) => [t.type, t._count])),
    dataSince: firstEvent?.createdAt ?? null,
  };
}

// ── Credit economy ───────────────────────────────────────────────────────────
// The ledger (positive delta = grant, negative = spend/expire/lapse). Also
// never read by admin — the dashboard has only ever shown the denormalised
// balance columns, which cannot answer "where did the credits go".
export async function creditsSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [daily, byBucket, sinks, sources] = await Promise.all([
    prisma.$queryRaw<Array<{ d: Date; granted: bigint; spent: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d,
             COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS granted,
             COALESCE(SUM(-delta) FILTER (WHERE delta < 0), 0) AS spent
      FROM "CreditTransaction" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ bucket: string; granted: bigint; spent: bigint }>>`
      SELECT bucket,
             COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS granted,
             COALESCE(SUM(-delta) FILTER (WHERE delta < 0), 0) AS spent
      FROM "CreditTransaction" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1`,
    // reason is "spend:<toolSlug>" — split so the chart labels the tool.
    prisma.$queryRaw<Array<{ tool: string; spent: bigint }>>`
      SELECT substring(reason from 7) AS tool, SUM(-delta) AS spent
      FROM "CreditTransaction"
      WHERE "createdAt" >= ${rangeStart} AND delta < 0 AND reason LIKE 'spend:%'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ reason: string; granted: bigint }>>`
      SELECT reason, SUM(delta) AS granted
      FROM "CreditTransaction"
      WHERE "createdAt" >= ${rangeStart} AND delta > 0
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
  ]);

  const series = fill(
    rangeDays,
    daily.map((r) => ({ date: day(r.d), granted: Number(r.granted), spent: Number(r.spent) })),
    { granted: 0, spent: 0 },
  );

  return {
    series,
    byBucket: byBucket.map((b) => ({ bucket: b.bucket, granted: Number(b.granted), spent: Number(b.spent) })),
    sinks: sinks.map((s) => ({ label: s.tool || "unknown", value: Number(s.spent) })),
    sources: sources.map((s) => ({ label: s.reason, value: Number(s.granted) })),
    netInRange: series.reduce((a, r) => a + r.granted - r.spent, 0),
  };
}

// ── Clip Minutes economy ─────────────────────────────────────────────────────
// The second meter (2026-09-26): AutoClip bills minutes of source video, not
// credits. Same ledger shape as CreditTransaction, so the same questions —
// granted vs consumed per day, which feature consumed them, where they came
// from — and the same shape of answer. Refunds are netted into "spent" so a
// failed run that was refunded counts as nothing.
export async function minutesSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [daily, sinks, sources, balances] = await Promise.all([
    prisma.$queryRaw<Array<{ d: Date; granted: bigint; spent: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d,
             COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND reason NOT LIKE 'refund%'), 0) AS granted,
             COALESCE(SUM(-delta) FILTER (WHERE reason LIKE 'spend:%' OR reason LIKE 'refund%'), 0) AS spent
      FROM "MinuteTransaction" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
    // Net of each run's own refunds (same refId), so a failed-and-refunded
    // run doesn't show up as consumption. Spends are collapsed per refId first
    // — one spend can write a row per bucket it drained.
    prisma.$queryRaw<Array<{ tool: string; spent: bigint; runs: bigint }>>`
      WITH spends AS (
        SELECT COALESCE("refId", id) AS ref, MIN(substring(reason from 7)) AS tool, SUM(-delta) AS spent
        FROM "MinuteTransaction"
        WHERE "createdAt" >= ${rangeStart} AND delta < 0 AND reason LIKE 'spend:%'
        GROUP BY 1
      ),
      refunds AS (
        SELECT "refId" AS ref, SUM(delta) AS refunded
        FROM "MinuteTransaction"
        WHERE reason LIKE 'refund%' AND "refId" IS NOT NULL AND delta > 0
        GROUP BY 1
      )
      SELECT s.tool, SUM(s.spent - LEAST(COALESCE(r.refunded, 0), s.spent)) AS spent, COUNT(*) AS runs
      FROM spends s LEFT JOIN refunds r ON r.ref = s.ref
      GROUP BY 1 HAVING SUM(s.spent - LEAST(COALESCE(r.refunded, 0), s.spent)) > 0
      ORDER BY 2 DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ reason: string; granted: bigint }>>`
      SELECT reason, SUM(delta) AS granted
      FROM "MinuteTransaction"
      WHERE "createdAt" >= ${rangeStart} AND delta > 0 AND reason NOT LIKE 'refund%'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.user.aggregate({
      _sum: { minutes: true, subscriptionMinutes: true, purchasedMinutes: true, bonusMinutes: true },
    }),
  ]);

  const series = fill(
    rangeDays,
    daily.map((r) => ({ date: day(r.d), granted: Number(r.granted), spent: Math.max(0, Number(r.spent)) })),
    { granted: 0, spent: 0 },
  );

  return {
    series,
    sinks: sinks.map((s) => ({ label: s.tool || "unknown", value: Number(s.spent), runs: Number(s.runs) })),
    sources: sources.map((s) => ({ label: s.reason, value: Number(s.granted) })),
    grantedInRange: series.reduce((a, r) => a + r.granted, 0),
    consumedInRange: series.reduce((a, r) => a + r.spent, 0),
    // Same estimate as aiSection's clipMinutes.estCostUsd, carried here so the
    // band's cost tile doesn't wait for the AI-cost band at the bottom to load.
    estCostUsd: series.reduce((a, r) => a + r.spent, 0) * ((await import("@/lib/tool-costs")).TOOL_COSTS["auto-clip"]?.costUsd ?? 0),
    /** Unspent minutes across every account right now, by bucket. */
    outstanding: {
      total: balances._sum.minutes ?? 0,
      subscription: balances._sum.subscriptionMinutes ?? 0,
      purchased: balances._sum.purchasedMinutes ?? 0,
      bonus: balances._sum.bonusMinutes ?? 0,
    },
  };
}

// ── Generation + AutoClip pipeline ───────────────────────────────────────────
export async function pipelineSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);

  const [genDaily, latency, heat, clipDaily, virality, renderTarget] = await Promise.all([
    prisma.$queryRaw<Array<{ d: Date; status: string; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, status, COUNT(*) AS n
      FROM "Generation" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<Array<{ d: Date; p50: number | null; p95: number | null }>>`
      SELECT date_trunc('day', "createdAt") AS d,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))::double precision) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))::double precision) AS p95
      FROM "Generation"
      WHERE "createdAt" >= ${rangeStart} AND status = 'completed' AND "completedAt" IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    // Bucketed in IST: the audience is India-first, so a UTC heatmap would put
    // the real evening peak in the middle of the night.
    //
    // The DOUBLE `AT TIME ZONE` is load-bearing. These columns are
    // TIMESTAMP(3) WITHOUT time zone holding UTC, so a single
    // `AT TIME ZONE 'Asia/Kolkata'` would INTERPRET the naive value as Kolkata
    // wall time and shift it the wrong way. The first cast labels it UTC, the
    // second converts to Kolkata.
    prisma.$queryRaw<Array<{ dow: number; hour: number; n: bigint }>>`
      SELECT EXTRACT(ISODOW FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int AS dow,
             EXTRACT(HOUR   FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int AS hour,
             COUNT(*) AS n
      FROM "Generation" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ d: Date; status: string; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, status, COUNT(*) AS n
      FROM "Clip" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<Array<{ bucket: number; n: bigint }>>`
      SELECT LEAST(score / 10, 9) AS bucket, COUNT(*) AS n
      FROM "Clip" WHERE "createdAt" >= ${rangeStart} AND score IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    prisma.clip.groupBy({
      by: ["renderTarget"],
      _count: true,
      where: { createdAt: { gte: rangeStart }, renderTarget: { not: null } },
    }),
  ]);

  const pivot = (rows: Array<{ d: Date; status: string; n: bigint }>) => {
    const per = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = day(r.d);
      const row = per.get(key) ?? {};
      row[r.status] = Number(r.n);
      per.set(key, row);
    }
    return [...per.entries()].map(([date, v]) => ({ date, ...v }));
  };

  const heatCells = heat.map((h) => ({ day: h.dow - 1, hour: h.hour, value: Number(h.n) }));
  const peak = heatCells.reduce<{ day: number; hour: number; value: number } | null>(
    (best, c) => (best === null || c.value > best.value ? c : best), null,
  );
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    generations: fill(rangeDays, pivot(genDaily), { completed: 0, failed: 0, cancelled: 0, pending: 0, refunded: 0 }),
    latency: fill(
      rangeDays,
      latency.map((r) => ({
        date: day(r.d),
        p50: r.p50 === null ? 0 : Math.round(Number(r.p50)),
        p95: r.p95 === null ? 0 : Math.round(Number(r.p95)),
      })),
      { p50: 0, p95: 0 },
    ),
    heatmap: heatCells,
    heatmapPeak: peak ? `${DAYS[peak.day]} ${String(peak.hour).padStart(2, "0")}:00 IST` : null,
    clips: fill(rangeDays, pivot(clipDaily), { ready: 0, rendering: 0, failed: 0, queued: 0 }),
    virality: Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}`,
      count: Number(virality.find((v) => Number(v.bucket) === i)?.n ?? 0),
    })),
    renderTarget: renderTarget.map((r) => ({ name: r.renderTarget ?? "unknown", value: r._count })),
  };
}

// ── Acquisition, messaging, platform ─────────────────────────────────────────
export async function acquisitionSection(rangeDays: number) {
  const rangeStart = new Date(Date.now() - rangeDays * DAY_MS);
  const dateKeys = denseDays(rangeDays);
  const fromKey = dateKeys[0];

  const [dau, activation, utm, email, vitals, storageSoFar, storageDaily] = await Promise.all([
    prisma.$queryRaw<Array<{ d: Date; users: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, COUNT(DISTINCT "userId") AS users
      FROM "LoginEvent" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
    // Activation for one signup cohort, from the User flags that already
    // exist. OnboardingEventDaily holds tour/asset touchpoints, NOT these
    // steps — it cannot answer this question.
    //
    // The three funnel steps are NESTED (each FILTER repeats the previous
    // conditions) so the series is monotonic by construction and the funnel
    // visual means what it looks like. Paying is deliberately NOT a fourth
    // step: nothing gates a purchase on making a video, and real data has
    // users who paid having activated nothing. Folding that into the funnel
    // would either break the shape or hide the sale, so it is reported
    // alongside as its own number.
    prisma.$queryRaw<[{ signed_up: bigint; onboarded: bigint; first_video: bigint; paid: bigint }]>`
      SELECT COUNT(*) AS signed_up,
             COUNT(*) FILTER (WHERE "onboardingCompletedAt" IS NOT NULL) AS onboarded,
             COUNT(*) FILTER (WHERE "onboardingCompletedAt" IS NOT NULL
                                AND "firstVideoAt" IS NOT NULL) AS first_video,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Purchase" p WHERE p."userId" = u.id AND p.status <> 'refunded')) AS paid
      FROM "User" u WHERE u."createdAt" >= ${rangeStart}`,
    prisma.$queryRaw<Array<{ date: string; source: string; n: bigint }>>`
      SELECT date, CASE WHEN "utmSource" = '' THEN 'direct' ELSE "utmSource" END AS source, SUM(count) AS n
      FROM "MarketingEventDaily" WHERE date >= ${fromKey}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<Array<{ d: Date; status: string; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, status, COUNT(*) AS n
      FROM "EmailLog"
      WHERE "createdAt" >= ${rangeStart} AND status IN ('sent','delivered','bounced','complained','failed')
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<Array<{ metric: string; bucket: string; n: bigint }>>`
      SELECT metric, bucket, SUM(count) AS n
      FROM "WebVitalDaily" WHERE date >= ${fromKey}
      GROUP BY 1, 2`,
    // Everything uploaded BEFORE the window, so the cumulative line starts at
    // the real total rather than from zero.
    prisma.asset.aggregate({ _sum: { size: true }, where: { createdAt: { lt: rangeStart } } }),
    prisma.$queryRaw<Array<{ d: Date; bytes: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, COALESCE(SUM(size), 0)::bigint AS bytes
      FROM "Asset" WHERE "createdAt" >= ${rangeStart}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const a = activation[0];
  const num = (v: bigint | null | undefined) => Number(v ?? 0);

  const utmSources = [...new Set(utm.map((u) => u.source))].slice(0, 6);
  const utmByDate = new Map<string, Record<string, number>>();
  for (const r of utm) {
    if (!utmSources.includes(r.source)) continue;
    const row = utmByDate.get(r.date) ?? {};
    row[r.source] = Number(r.n);
    utmByDate.set(r.date, row);
  }

  const emailByDate = new Map<string, Record<string, number>>();
  for (const r of email) {
    const key = day(r.d);
    const row = emailByDate.get(key) ?? {};
    // `sent` is the pre-webhook state of a delivered message; grouping them
    // keeps the 100% stack from showing a phantom "undelivered" band.
    const k = r.status === "sent" ? "delivered" : r.status;
    row[k] = (row[k] ?? 0) + Number(r.n);
    emailByDate.set(key, row);
  }

  let running = Number(storageSoFar._sum.size ?? 0);
  const byDayBytes = new Map(storageDaily.map((r) => [day(r.d), Number(r.bytes)]));
  const storage = dateKeys.map((date) => {
    running += byDayBytes.get(date) ?? 0;
    return { date, gb: Number((running / 1024 ** 3).toFixed(2)) };
  });

  const vitalMetrics = [...new Set(vitals.map((v) => v.metric))];

  return {
    dau: fill(rangeDays, dau.map((r) => ({ date: day(r.d), users: Number(r.users) })), { users: 0 }),
    activation: [
      { name: "Signed up", value: num(a?.signed_up) },
      { name: "Completed onboarding", value: num(a?.onboarded) },
      { name: "Made first video", value: num(a?.first_video) },
    ],
    // Not a funnel step — see the query comment. Reported so a purchase from
    // a user who never activated is visible rather than swallowed.
    paidInCohort: num(a?.paid),
    utmSources,
    // Built by hand rather than through fill(): the source names are dynamic,
    // so the zero row is an index signature, which cannot carry `date`.
    utm: dateKeys.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const s of utmSources) row[s] = utmByDate.get(date)?.[s] ?? 0;
      return row;
    }),
    email: fill(
      rangeDays,
      [...emailByDate.entries()].map(([date, v]) => ({ date, ...v })),
      { delivered: 0, bounced: 0, complained: 0, failed: 0 },
    ),
    webVitals: vitalMetrics.map((metric) => {
      const of = (bucket: string) => Number(vitals.find((v) => v.metric === metric && v.bucket === bucket)?.n ?? 0);
      const good = of("good"), ni = of("needs_improvement"), poor = of("poor");
      const total = good + ni + poor;
      return { metric, good, needsImprovement: ni, poor, goodPct: total > 0 ? (good / total) * 100 : null };
    }),
    storage,
    storageNowGb: storage[storage.length - 1]?.gb ?? 0,
  };
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
    case "lifecycle": return lifecycleSection(rangeDays);
    case "credits": return creditsSection(rangeDays);
    case "minutes": return minutesSection(rangeDays);
    case "pipeline": return pipelineSection(rangeDays);
    case "acquisition": return acquisitionSection(rangeDays);
  }
}
