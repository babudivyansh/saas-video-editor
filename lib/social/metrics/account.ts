// The per-account analytics aggregate that drives the account deep-dive view,
// the public report page, and the AI factsheet. Pure.
//
// Behaviour is preserved exactly from the pre-split implementation, with one
// deliberate change: `now` is a required parameter rather than defaulting to
// `new Date()`, so a caller cannot accidentally make a test time-dependent.

import { dayKey, within, type TimeZone } from "./dates";
import { contentTypeBreakdown, postEngagementRate, rankByAudience, type ContentTypeBreakdown } from "./posts";
import {
  cumulativeSeries,
  latestValue,
  mean,
  pctChange,
  windowDelta,
  type CumulativeRow,
  type MetricDelta,
  type SeriesPoint,
} from "./series";
import { postingFrequency } from "./timing";
import type { PostRow, SnapshotRow } from "./types";

export interface AccountAnalytics {
  rangeDays: number;
  followers: MetricDelta;
  /** Percent, e.g. 3.2. */
  engagementRate: MetricDelta;
  /** Views gained within the range (cumulative snapshot delta). */
  views: MetricDelta;
  postsInRange: number;
  postsPerWeek: number | null;
  followerSeries: SeriesPoint[];
  /** Cumulative account views over time. */
  viewsSeries: SeriesPoint[];
  /** Average post ER (%) per day that posts were published. */
  engagementSeries: SeriesPoint[];
  topPosts: Array<PostRow & { engagementRate: number | null }>;
  contentTypes: ContentTypeBreakdown[];
}

/** Pull one numeric field out of the snapshots as a cumulative series. */
function column(snapshots: SnapshotRow[], field: keyof SnapshotRow): CumulativeRow[] {
  const out: CumulativeRow[] = [];
  for (const s of snapshots) {
    const v = s[field];
    if (typeof v === "number") out.push({ capturedAt: s.capturedAt, value: v });
  }
  return out;
}

/** Snapshots must be sorted ascending by capturedAt; posts may be in any order. */
export function computeAnalytics(
  snapshots: SnapshotRow[],
  posts: PostRow[],
  rangeDays: number,
  now: Date,
  tz: TimeZone = "UTC",
): AccountAnalytics {
  const from = new Date(now.getTime() - rangeDays * 86_400_000);
  const prevFrom = new Date(from.getTime() - rangeDays * 86_400_000);

  const postsInRange = posts.filter((p) => within(p.publishedAt ?? null, from, now));
  const postsPrev = posts.filter((p) => within(p.publishedAt ?? null, prevFrom, from));

  const rated = (list: PostRow[]) =>
    mean(list.map(postEngagementRate).filter((v): v is number => v !== null));
  const erInRange = rated(postsInRange);
  const erPrev = rated(postsPrev);

  const followerRows = column(snapshots, "followers");
  const followersNow = latestValue(followerRows, now);
  const followersAtRangeStart = latestValue(followerRows, from);

  const viewRows = column(snapshots, "views");
  const viewsGained = windowDelta(viewRows, from, now);
  const viewsGainedPrev = windowDelta(viewRows, prevFrom, from);

  // Average ER of posts published each day. Noisy but honest; the UI smooths it.
  const erByDay = new Map<string, number[]>();
  for (const p of postsInRange) {
    const er = postEngagementRate(p);
    if (er === null || !p.publishedAt) continue;
    const key = dayKey(p.publishedAt, tz);
    const bucket = erByDay.get(key);
    if (bucket) bucket.push(er);
    else erByDay.set(key, [er]);
  }
  const engagementSeries = [...erByDay.entries()]
    .map(([date, values]) => ({ date, value: mean(values)! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    rangeDays,
    followers: {
      current: followersNow,
      previous: followersAtRangeStart,
      deltaPct: pctChange(followersNow, followersAtRangeStart),
    },
    engagementRate: { current: erInRange, previous: erPrev, deltaPct: pctChange(erInRange, erPrev) },
    views: { current: viewsGained, previous: viewsGainedPrev, deltaPct: pctChange(viewsGained, viewsGainedPrev) },
    postsInRange: postsInRange.length,
    postsPerWeek: postingFrequency(postsInRange.length, rangeDays),
    followerSeries: cumulativeSeries(followerRows, from, tz),
    viewsSeries: cumulativeSeries(viewRows, from, tz),
    engagementSeries,
    topPosts: rankByAudience(postsInRange)
      .slice(0, 5)
      .map((p) => ({ ...p, engagementRate: postEngagementRate(p) })),
    contentTypes: contentTypeBreakdown(postsInRange),
  };
}
