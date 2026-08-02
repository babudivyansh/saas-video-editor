// Read-side data loading for the Social Tracker API.
//
// The only place in the feature that turns Prisma rows into the shapes
// lib/social/metrics consumes. Routes stay thin: validate, assert ownership,
// call one of these, hand the rows to a pure function.

import { prisma } from "@/lib/prisma";
import { capabilityMap, mergeCapabilities, type MetricKey, type Support } from "./capabilities";
import {
  computeKpis,
  computeDerivedKpis,
  dataCompleteness,
  type DailyMetricRow,
  type KpiSet,
  type SeriesPoint,
  type TimeZone,
  bucketLast,
  bucketSum,
  fillForward,
  fillGaps,
  type Granularity,
} from "./metrics";
import type { ProviderId } from "./types";

/** Metrics that are levels, not flows — rolled up by last value, not sum. */
const LEVEL_METRICS = new Set<MetricKey>(["followers"]);

/** Metric key → SocialDailyMetric column. Only columns that exist. */
const METRIC_COLUMN: Partial<Record<MetricKey, keyof DailyMetricRow>> = {
  followers: "followers",
  followersGained: "followersGained",
  followersLost: "followersLost",
  impressions: "impressions",
  reach: "reach",
  views: "views",
  plays: "plays",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  totalInteractions: "totalInteractions",
  profileViews: "profileViews",
  websiteClicks: "websiteClicks",
  watchTimeSec: "watchTimeSec",
  avgViewDurationSec: "avgViewDurationSec",
  avgViewPercentage: "avgViewPercentage",
  ctr: "ctr",
  postsPublished: "postsPublished",
};

export interface AccountContext {
  id: string;
  provider: ProviderId;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number | null;
  status: string;
  lastSyncedAt: Date | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  timezone: string | null;
  healthScore: number | null;
  observed: Record<string, Support> | null;
}

/** Owned accounts with everything the read side needs, and no token columns. */
export async function loadAccounts(userId: string, accountIds?: string[]): Promise<AccountContext[]> {
  const rows = await prisma.socialAccount.findMany({
    where: { userId, ...(accountIds?.length ? { id: { in: accountIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, provider: true, username: true, displayName: true, avatarUrl: true,
      followers: true, status: true, lastSyncedAt: true, lastSyncStatus: true,
      lastSyncError: true, timezone: true, healthScore: true, capabilitiesJson: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as ProviderId,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    followers: r.followers,
    status: r.status,
    lastSyncedAt: r.lastSyncedAt,
    lastSyncStatus: r.lastSyncStatus,
    lastSyncError: r.lastSyncError,
    timezone: r.timezone,
    healthScore: r.healthScore,
    observed:
      r.capabilitiesJson && typeof r.capabilitiesJson === "object"
        ? (r.capabilitiesJson as Record<string, Support>)
        : null,
  }));
}

/** Daily rows for one account across a half-open window, ascending. */
export async function loadDailyMetrics(
  accountId: string,
  from: Date,
  to: Date,
): Promise<DailyMetricRow[]> {
  const rows = await prisma.socialDailyMetric.findMany({
    where: { accountId, date: { gte: startOfUtcDay(from), lt: startOfUtcDay(to) } },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    impressions: r.impressions,
    reach: r.reach,
    views: r.views,
    plays: r.plays,
    followers: r.followers,
    followersGained: r.followersGained,
    followersLost: r.followersLost,
    profileViews: r.profileViews,
    websiteClicks: r.websiteClicks,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    totalInteractions: r.totalInteractions,
    accountsEngaged: r.accountsEngaged,
    watchTimeSec: r.watchTimeSec,
    avgViewDurationSec: r.avgViewDurationSec,
    avgViewPercentage: r.avgViewPercentage,
    ctr: r.ctr,
    postsPublished: r.postsPublished,
  }));
}

/** @db.Date columns are stored at UTC midnight; compare against the same. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Follower level series. Prefers the daily table's cumulative mirror and falls
 * back to snapshots, so an account synced before daily metrics existed still
 * charts.
 */
export async function loadFollowerSeries(
  accountId: string,
  from: Date,
  to: Date,
  tz: TimeZone = "UTC",
): Promise<SeriesPoint[]> {
  const daily = await loadDailyMetrics(accountId, from, to);
  const fromDaily = daily
    .filter((d) => typeof d.followers === "number")
    .map((d) => ({ date: d.date, value: d.followers as number }));
  if (fromDaily.length > 0) return fillForward(fromDaily, from, to, tz);

  const snapshots = await prisma.socialAccountSnapshot.findMany({
    where: { accountId, capturedAt: { gte: from, lt: to }, followers: { not: null } },
    orderBy: { capturedAt: "asc" },
    select: { capturedAt: true, followers: true },
  });
  const byDay = new Map<string, number>();
  for (const s of snapshots) byDay.set(s.capturedAt.toISOString().slice(0, 10), s.followers!);
  return fillForward(
    [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
    from,
    to,
    tz,
  );
}

export interface AccountKpis {
  account: AccountContext;
  kpis: KpiSet;
  derived: ReturnType<typeof computeDerivedKpis>;
  completeness: number;
  capabilities: Record<MetricKey, Support>;
}

/** Full KPI set for one account, including its previous-period comparison. */
export async function loadAccountKpis(
  account: AccountContext,
  from: Date,
  to: Date,
  tz: TimeZone,
): Promise<AccountKpis> {
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);

  const [current, previous, followerSeries] = await Promise.all([
    loadDailyMetrics(account.id, from, to),
    loadDailyMetrics(account.id, prevFrom, from),
    loadFollowerSeries(account.id, from, to, tz),
  ]);

  const input = {
    provider: account.provider,
    observed: account.observed,
    current,
    previous,
    followerSeries,
    windowStart: from,
    windowEnd: to,
  };

  const kpis = computeKpis(input);
  return {
    account,
    kpis,
    derived: computeDerivedKpis(input),
    completeness: dataCompleteness(kpis),
    capabilities: capabilityMap(account.provider, account.observed),
  };
}

export interface SeriesResult {
  accountId: string;
  metric: MetricKey;
  unit: string;
  available: Support;
  points: SeriesPoint[];
}

/**
 * One metric's series for one account at the requested granularity.
 *
 * Sums flows, takes the last value for levels — applying the wrong reducer
 * produces plausible nonsense (a follower count that "sums" to ten times the
 * audience), so the distinction is explicit rather than inferred.
 *
 * An unavailable metric returns an empty series with its support value attached,
 * never a line of zeros.
 */
export async function loadSeries(
  account: AccountContext,
  metric: MetricKey,
  from: Date,
  to: Date,
  granularity: Granularity,
  tz: TimeZone,
): Promise<SeriesResult> {
  const caps = capabilityMap(account.provider, account.observed);
  const available = caps[metric];
  const base = { accountId: account.id, metric, unit: "count", available };

  if (available === "unavailable") return { ...base, points: [] };

  if (metric === "followers") {
    const points = await loadFollowerSeries(account.id, from, to, tz);
    return { ...base, points: bucketLast(points, granularity, tz) };
  }

  const column = METRIC_COLUMN[metric];
  if (!column) return { ...base, points: [] };

  const rows = await loadDailyMetrics(account.id, from, to);
  const values = rows
    .filter((r) => typeof r[column] === "number")
    .map((r) => ({ date: r.date, value: r[column] as number }));

  if (values.length === 0) return { ...base, points: [] };

  const daily = fillGaps(values, from, to, tz, 0);
  const points = LEVEL_METRICS.has(metric)
    ? bucketLast(daily, granularity, tz)
    : bucketSum(daily, granularity, tz);

  return { ...base, points };
}

/** Capability map across a selection — a metric is available if ANY account has it. */
export function combinedCapabilities(accounts: AccountContext[]): Record<MetricKey, Support> {
  return mergeCapabilities(accounts.map((a) => capabilityMap(a.provider, a.observed)));
}
