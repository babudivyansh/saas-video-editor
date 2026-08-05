// The executive KPI set: every metric the dashboard shows, with a
// period-over-period delta and — critically — its availability.
//
// "No data yet", "this platform never reports this", and "genuinely zero" are
// three different states that the old dashboard rendered identically. Every
// entry here carries `available`, straight from effectiveCapability, so the UI
// can tell them apart.

import {
  METRIC_KEYS,
  effectiveCapability,
  type MetricKey,
  type MetricUnit,
  type ObservedCapabilities,
  type Support,
} from "../capabilities";
import type { ProviderId } from "../types";
import { daysBetween } from "./dates";
import { growthRates } from "./growth";
import { delta, sum, type MetricDelta, type SeriesPoint } from "./series";
import { postingFrequency } from "./timing";
import type { DailyMetricRow } from "./types";

export interface Kpi extends MetricDelta {
  metric: MetricKey;
  available: Support;
  unit: MetricUnit;
  /** Why it is unavailable, when it is. Straight to the tooltip. */
  reason?: string;
}

export type KpiSet = Record<MetricKey, Kpi>;

export interface KpiInput {
  provider: ProviderId;
  observed?: ObservedCapabilities | null;
  /** Daily rows inside the window, ascending by date. */
  current: DailyMetricRow[];
  /** Daily rows for the equal-length window immediately before. */
  previous: DailyMetricRow[];
  /** Follower level series over the window, for growth rates. */
  followerSeries: SeriesPoint[];
  windowStart: Date;
  windowEnd: Date;
}

// NOTE: `impressions` and `ctr` are deliberately absent from both maps below.
// Each has a documented fallback (impressions → views where the platform retired
// the metric; ctr → clicks ÷ impressions), and a map entry would shadow it —
// valueFor consults the maps first, so the fallback would never run.

/** Metrics that accumulate: a window's value is the sum of its days. */
const ADDITIVE: Partial<Record<MetricKey, keyof DailyMetricRow>> = {
  reach: "reach",
  views: "views",
  plays: "plays",
  followersGained: "followersGained",
  followersLost: "followersLost",
  profileViews: "profileViews",
  websiteClicks: "websiteClicks",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  totalInteractions: "totalInteractions",
  // accountsEngaged is stored on SocialDailyMetric (Instagram reports it) but is
  // not a headline KPI, so it has no MetricKey and no tile.
  watchTimeSec: "watchTimeSec",
  postsPublished: "postsPublished",
};

/** Metrics that are rates: a window's value is the mean of its days. */
const AVERAGED: Partial<Record<MetricKey, keyof DailyMetricRow>> = {
  avgViewDurationSec: "avgViewDurationSec",
  avgViewPercentage: "avgViewPercentage",
};

function column(rows: DailyMetricRow[], field: keyof DailyMetricRow): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Sum, or null when no day reported the metric — distinct from a real zero. */
function sumOrNull(rows: DailyMetricRow[], field: keyof DailyMetricRow): number | null {
  const values = column(rows, field);
  return values.length === 0 ? null : sum(values);
}

/**
 * Floor a tally of countable things at zero, preserving null.
 *
 * Providers report some of these as NET daily movements, so a single day can
 * legitimately arrive negative — YouTube Analytics `likes` goes below zero on a
 * day when removed likes outnumber new ones. Summed over a quiet window that
 * produced "Likes −1" and, once it reached the engagement-rate denominator,
 * "Engagement rate −100%" on a live dashboard.
 *
 * Clamping the WINDOW SUM rather than each day is deliberate: a provider
 * restating a day (+5, then a −1 correction) should net to 4. Clamping per day
 * would read that as 5 and quietly inflate every total. Only a window that is
 * negative overall — which is not a real quantity — gets floored.
 *
 * null still means "not reported" and survives untouched; it is not a zero.
 */
function nonNegative(value: number | null): number | null {
  return value === null ? null : Math.max(0, value);
}

function meanOrNull(rows: DailyMetricRow[], field: keyof DailyMetricRow): number | null {
  const values = column(rows, field);
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Last reported value — for levels like follower count. */
function lastOrNull(rows: DailyMetricRow[], field: keyof DailyMetricRow): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const v = rows[i][field];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Engagement rate as a percentage of the audience reached.
 *
 * Reach is the correct denominator where reported; views is the video-platform
 * stand-in. Returns null rather than 0 when neither is known — an unmeasurable
 * rate is not a rate of zero.
 */
function engagementRateOf(rows: DailyMetricRow[]): number | null {
  const interactions =
    sumOrNull(rows, "totalInteractions") ??
    (() => {
      const parts = [
        sumOrNull(rows, "likes"),
        sumOrNull(rows, "comments"),
        sumOrNull(rows, "shares"),
        sumOrNull(rows, "saves"),
      ].filter((v): v is number => v !== null);
      return parts.length === 0 ? null : sum(parts);
    })();
  if (interactions === null) return null;

  const denominator = sumOrNull(rows, "reach") ?? sumOrNull(rows, "views");
  if (denominator === null || denominator <= 0) return null;
  // A negative interaction total is not a negative rate of engagement — see
  // nonNegative. Without this, one net-unliked day over a low-view window
  // renders as "-100%".
  return ((nonNegative(interactions) as number) / denominator) * 100;
}

/** Impressions, falling back to views where the platform retired the metric. */
function impressionsOf(rows: DailyMetricRow[]): number | null {
  return sumOrNull(rows, "impressions") ?? sumOrNull(rows, "views");
}

function ctrOf(rows: DailyMetricRow[]): number | null {
  const direct = meanOrNull(rows, "ctr");
  if (direct !== null) return direct;
  const clicks = sumOrNull(rows, "websiteClicks");
  const impressions = impressionsOf(rows);
  if (clicks === null || impressions === null || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

/** Average views per published post — one of the requested KPIs. */
function averageViewsOf(rows: DailyMetricRow[]): number | null {
  const views = sumOrNull(rows, "views");
  const posts = sumOrNull(rows, "postsPublished");
  if (views === null || posts === null || posts <= 0) return null;
  return views / posts;
}

/**
 * Compute every KPI for a window, with its previous-period comparison.
 *
 * A metric the provider cannot supply still appears in the result, with
 * `available: "unavailable"` and a reason — the UI renders it greyed rather than
 * omitting it, so the dashboard shape is stable across platforms.
 */
export function computeKpis(input: KpiInput): KpiSet {
  const { provider, observed, current, previous, followerSeries } = input;
  const days = daysBetween(input.windowStart, input.windowEnd);
  const growth = growthRates(followerSeries);

  const valueFor = (metric: MetricKey, rows: DailyMetricRow[]): number | null => {
    // Every ADDITIVE metric is a count of things that happened — posts, likes,
    // seconds watched. None of them can be negative over a window.
    const additive = ADDITIVE[metric];
    if (additive) return nonNegative(sumOrNull(rows, additive));
    const averaged = AVERAGED[metric];
    if (averaged) return meanOrNull(rows, averaged);

    switch (metric) {
      case "followers":
        return lastOrNull(rows, "followers");
      case "engagementRate":
        return engagementRateOf(rows);
      case "impressions":
        return impressionsOf(rows);
      case "ctr":
        return ctrOf(rows);
      case "postingFrequency": {
        const posts = sumOrNull(rows, "postsPublished");
        return posts === null ? null : postingFrequency(posts, days);
      }
      default:
        return null;
    }
  };

  const set = {} as KpiSet;

  for (const metric of METRIC_KEYS) {
    const cap = effectiveCapability(provider, metric, observed);
    const base = {
      metric,
      available: cap.support,
      unit: cap.unit,
      ...(cap.support === "unavailable" ? { reason: cap.reason } : {}),
    };

    // Unavailable metrics carry no numbers at all. Emitting a zero here is
    // exactly the conflation this whole structure exists to prevent.
    if (cap.support === "unavailable") {
      set[metric] = { ...base, current: null, previous: null, deltaPct: null };
      continue;
    }

    // Growth rates come from the follower series, not from daily columns.
    if (metric === "followerGrowthRate") {
      set[metric] = { ...base, current: growth.total, previous: null, deltaPct: null };
      continue;
    }

    set[metric] = { ...base, ...delta(valueFor(metric, current), valueFor(metric, previous)) };
  }

  return set;
}

export interface DerivedKpis {
  /** Views ÷ posts published. Not a MetricKey — a presentation-level figure. */
  averageViews: MetricDelta;
  dailyGrowth: number | null;
  weeklyGrowth: number | null;
  monthlyGrowth: number | null;
}

/** KPIs the grid shows that are not provider metrics in their own right. */
export function computeDerivedKpis(input: KpiInput): DerivedKpis {
  const growth = growthRates(input.followerSeries);
  return {
    averageViews: delta(averageViewsOf(input.current), averageViewsOf(input.previous)),
    dailyGrowth: growth.daily,
    weeklyGrowth: growth.weekly,
    monthlyGrowth: growth.monthly,
  };
}

/**
 * Fraction of this provider's supportable metrics that the account actually
 * reported. Feeds the `dataCompleteness` component of the health score, and
 * tells the user whether a low score reflects performance or missing data.
 */
export function dataCompleteness(kpis: KpiSet): number {
  // Only count metrics this account could supply — an account is not incomplete
  // because its platform lacks a metric, which is what makes this fair across
  // providers.
  const supportable = METRIC_KEYS.filter((m) => kpis[m].available !== "unavailable");
  if (supportable.length === 0) return 0;
  const withData = supportable.filter((m) => kpis[m].current !== null);
  return withData.length / supportable.length;
}
