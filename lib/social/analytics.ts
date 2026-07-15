// Pure analytics computation over already-synced data. No I/O here — callers
// (the analytics API route, tests, later the AI insight generator) pass rows in
// and get derived metrics out, so every formula is unit-testable and the same
// numbers feed every consumer.

export interface SnapshotRow {
  capturedAt: Date;
  followers?: number | null;
  views?: number | null;
  impressions?: number | null;
  reach?: number | null;
  engagement?: number | null;
}

export interface PostRow {
  id: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  publishedAt?: Date | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  watchTimeSec?: number | null;
}

export interface SeriesPoint {
  date: string; // yyyy-mm-dd
  value: number;
}

export interface MetricDelta {
  current: number | null;
  previous: number | null; // same-length period immediately before the range
  deltaPct: number | null; // null when previous is 0/unknown
}

export interface AccountAnalytics {
  rangeDays: number;
  followers: MetricDelta;
  engagementRate: MetricDelta; // percent, e.g. 3.2
  views: MetricDelta; // gained within range (snapshot delta)
  postsInRange: number;
  postsPerWeek: number | null;
  followerSeries: SeriesPoint[];
  viewsSeries: SeriesPoint[]; // cumulative account views over time
  engagementSeries: SeriesPoint[]; // avg post ER (%) per day posts were published
  topPosts: Array<PostRow & { engagementRate: number | null }>;
  contentTypes: Array<{ type: string; count: number; avgEngagementRate: number | null }>;
}

// ER = interactions / audience-that-saw-it. Reach is the honest denominator
// when the platform provides it (IG/FB); views is the video-platform stand-in
// (YouTube). Posts where neither is known can't have a rate.
export function postEngagementRate(p: PostRow): number | null {
  const interactions = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
  const denominator = Math.max(p.reach ?? 0, p.views ?? 0);
  if (denominator <= 0) return null;
  return (interactions / denominator) * 100;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function within(d: Date | null | undefined, from: Date, to: Date): boolean {
  return !!d && d.getTime() >= from.getTime() && d.getTime() < to.getTime();
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Latest snapshot value per day for a field → chart-ready series.
function snapshotSeries(snapshots: SnapshotRow[], field: keyof SnapshotRow, from: Date): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const s of snapshots) {
    const v = s[field];
    if (typeof v !== "number" || s.capturedAt < from) continue;
    byDay.set(dayKey(s.capturedAt), v); // snapshots arrive ascending — last write wins
  }
  return [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

// Change in a snapshot field across a window: last value in window minus the
// closest value at-or-before the window start (so a quiet week reads as 0, not
// as "no data").
function windowDelta(snapshots: SnapshotRow[], field: keyof SnapshotRow, from: Date, to: Date): number | null {
  let baseline: number | null = null;
  let last: number | null = null;
  for (const s of snapshots) {
    const v = s[field];
    if (typeof v !== "number") continue;
    if (s.capturedAt.getTime() <= from.getTime()) baseline = v;
    else if (s.capturedAt.getTime() <= to.getTime()) last = v;
  }
  if (last === null) return null;
  if (baseline === null) return null;
  return last - baseline;
}

function latestValue(snapshots: SnapshotRow[], field: keyof SnapshotRow, atOrBefore: Date): number | null {
  let out: number | null = null;
  for (const s of snapshots) {
    const v = s[field];
    if (typeof v === "number" && s.capturedAt.getTime() <= atOrBefore.getTime()) out = v;
  }
  return out;
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// Snapshots must be sorted ascending by capturedAt; posts in any order.
export function computeAnalytics(snapshots: SnapshotRow[], posts: PostRow[], rangeDays: number, now = new Date()): AccountAnalytics {
  const from = new Date(now.getTime() - rangeDays * 86400_000);
  const prevFrom = new Date(from.getTime() - rangeDays * 86400_000);

  const postsInRange = posts.filter((p) => within(p.publishedAt ?? null, from, now));
  const postsPrev = posts.filter((p) => within(p.publishedAt ?? null, prevFrom, from));

  const erInRange = mean(postsInRange.map(postEngagementRate).filter((v): v is number => v !== null));
  const erPrev = mean(postsPrev.map(postEngagementRate).filter((v): v is number => v !== null));

  const followersNow = latestValue(snapshots, "followers", now);
  const followersAtRangeStart = latestValue(snapshots, "followers", from);

  const viewsGained = windowDelta(snapshots, "views", from, now);
  const viewsGainedPrev = windowDelta(snapshots, "views", prevFrom, from);

  const ranked = postsInRange
    .map((p) => ({ ...p, engagementRate: postEngagementRate(p) }))
    .sort((a, b) => (b.views ?? b.reach ?? 0) - (a.views ?? a.reach ?? 0));

  const byType = new Map<string, PostRow[]>();
  for (const p of postsInRange) {
    const type = p.mediaType || "other";
    byType.set(type, [...(byType.get(type) ?? []), p]);
  }
  const contentTypes = [...byType.entries()]
    .map(([type, group]) => ({
      type,
      count: group.length,
      avgEngagementRate: mean(group.map(postEngagementRate).filter((v): v is number => v !== null)),
    }))
    .sort((a, b) => b.count - a.count);

  // Avg ER of posts published each day — noisy but honest; smooths in the UI.
  const erByDay = new Map<string, number[]>();
  for (const p of postsInRange) {
    const er = postEngagementRate(p);
    if (er === null || !p.publishedAt) continue;
    const key = dayKey(p.publishedAt);
    erByDay.set(key, [...(erByDay.get(key) ?? []), er]);
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
    postsPerWeek: postsInRange.length > 0 ? (postsInRange.length / rangeDays) * 7 : postsInRange.length === 0 ? 0 : null,
    followerSeries: snapshotSeries(snapshots, "followers", from),
    viewsSeries: snapshotSeries(snapshots, "views", from),
    engagementSeries,
    topPosts: ranked.slice(0, 5),
    contentTypes,
  };
}
