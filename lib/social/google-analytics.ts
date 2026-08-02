// YouTube Analytics API v2.
//
// Split out of google.ts, which was already 315 lines doing OAuth, the Data API
// and resumable upload. The Data API gives profile and video metadata; every
// time-series number comes from here.
//
// This replaces a single-metric fetchWatchTime call. One report request returns
// ten metrics for the same latency, so the old version was leaving most of the
// available data on the table.
//
// QUOTA. The Analytics API is metered per query, not by the Data API's unit
// system, and seven report calls per account per day is trivial. The constraint
// worth watching is the Data API's 10,000 units/day PER APP, which lib/social
// tracks separately.
//
// Every function here is non-fatal by design: analytics are an enrichment, and a
// failure must degrade the sync rather than fail it. Failures are RECORDED into
// an observed-capability map instead of being swallowed, so the UI can explain
// why a tile is empty.

import { ProviderApiError } from "./errors";
import type { AudienceRow, NormalizedDailyMetric, ObservedCapabilityMap } from "./types";

const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

/** Analytics data lags ~48h; asking for today returns a partial or empty row. */
const LAG_DAYS = 2;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface ReportResponse {
  columnHeaders?: Array<{ name: string }>;
  rows?: Array<Array<string | number>>;
}

/**
 * Run one report. Returns null on any failure — the caller records that as an
 * observed capability rather than throwing.
 */
async function report(
  accessToken: string,
  params: Record<string, string>,
): Promise<ReportResponse | null> {
  const query = new URLSearchParams({ ids: "channel==MINE", ...params });
  try {
    const res = await fetch(`${ANALYTICS}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      // 403 here almost always means the yt-analytics.readonly scope was never
      // granted — the account connected before it was requested. Distinguishing
      // that from a transient failure is what lets the UI say "reconnect".
      if (res.status === 403 || res.status === 401) return null;
      if (res.status >= 500 || res.status === 429) {
        throw new ProviderApiError(`youtube analytics failed: ${res.status}`, res.status, await res.text());
      }
      return null;
    }
    return (await res.json()) as ReportResponse;
  } catch (err) {
    if (err instanceof ProviderApiError) throw err;
    return null;
  }
}

/** Index a report's rows by column name, so callers never depend on column order. */
function rowsAsRecords(resp: ReportResponse | null): Array<Record<string, string | number>> {
  if (!resp?.rows || !resp.columnHeaders) return [];
  const names = resp.columnHeaders.map((h) => h.name);
  return resp.rows.map((row) => {
    const out: Record<string, string | number> = {};
    names.forEach((name, i) => {
      out[name] = row[i];
    });
    return out;
  });
}

const num = (v: string | number | undefined): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

// ── Daily channel report ─────────────────────────────────────────────────────

const DAILY_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
  "videosAddedToPlaylists",
].join(",");

export interface DailyReport {
  days: NormalizedDailyMetric[];
  observed: ObservedCapabilityMap;
}

/**
 * Per-day channel metrics from `since` (or 365 days back) up to the reporting
 * lag. Maps YouTube's vocabulary onto our MetricKeys — the mapping lives here so
 * nothing downstream needs to know YouTube calls saves "videosAddedToPlaylists".
 */
export async function fetchDailyMetrics(
  accessToken: string,
  since?: Date,
  now: Date = new Date(),
): Promise<DailyReport> {
  const endDate = new Date(now.getTime() - LAG_DAYS * 86_400_000);
  const startDate = since ?? new Date(now.getTime() - 365 * 86_400_000);
  if (startDate.getTime() > endDate.getTime()) return { days: [], observed: {} };

  const resp = await report(accessToken, {
    startDate: isoDay(startDate),
    endDate: isoDay(endDate),
    metrics: DAILY_METRICS,
    dimensions: "day",
    sort: "day",
    maxResults: "400",
  });

  if (resp === null) {
    // Every metric that would have come from this report is unavailable for
    // this account — almost always a missing yt-analytics.readonly grant.
    return {
      days: [],
      observed: {
        views: "unavailable",
        watchTimeSec: "unavailable",
        avgViewDurationSec: "unavailable",
        avgViewPercentage: "unavailable",
        followersGained: "unavailable",
        followersLost: "unavailable",
        shares: "unavailable",
        saves: "unavailable",
      },
    };
  }

  const days: NormalizedDailyMetric[] = rowsAsRecords(resp).map((r) => {
    const metrics: Record<string, number> = {};
    const set = (key: string, value: number | undefined) => {
      if (value !== undefined) metrics[key] = value;
    };
    set("views", num(r.views));
    set("plays", num(r.views));
    // The API reports minutes; everything downstream is in seconds.
    const minutes = num(r.estimatedMinutesWatched);
    set("watchTimeSec", minutes === undefined ? undefined : minutes * 60);
    set("avgViewDurationSec", num(r.averageViewDuration));
    set("avgViewPercentage", num(r.averageViewPercentage));
    set("followersGained", num(r.subscribersGained));
    set("followersLost", num(r.subscribersLost));
    set("likes", num(r.likes));
    set("comments", num(r.comments));
    set("shares", num(r.shares));
    // YouTube has no "saves"; playlist adds are the closest honest equivalent,
    // and capabilities.ts marks the metric derived rather than native.
    set("saves", num(r.videosAddedToPlaylists));

    const interactions =
      (num(r.likes) ?? 0) + (num(r.comments) ?? 0) + (num(r.shares) ?? 0);
    if (interactions > 0) metrics.totalInteractions = interactions;

    return { date: String(r.day), metrics };
  });

  return { days, observed: {} };
}

// ── Per-video report ─────────────────────────────────────────────────────────

const VIDEO_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
].join(",");

export interface VideoMetrics {
  views?: number;
  watchTimeSec?: number;
  avgWatchTimeSec?: number;
  avgViewPercentage?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  follows?: number;
}

/** Max video ids per `video==` filter. */
const VIDEO_FILTER_CHUNK = 50;

/**
 * Per-video metrics, keyed by video id.
 *
 * Supersedes the old fetchWatchTime, which asked for one metric where the same
 * call returns eight — notably avgViewPercentage, the only honest retention
 * signal any of our three providers exposes.
 */
export async function fetchVideoReport(
  accessToken: string,
  videoIds: string[],
  now: Date = new Date(),
  windowDays = 90,
): Promise<Record<string, VideoMetrics>> {
  if (videoIds.length === 0) return {};

  const endDate = isoDay(new Date(now.getTime() - LAG_DAYS * 86_400_000));
  const startDate = isoDay(new Date(now.getTime() - windowDays * 86_400_000));
  const out: Record<string, VideoMetrics> = {};

  for (let i = 0; i < videoIds.length; i += VIDEO_FILTER_CHUNK) {
    const chunk = videoIds.slice(i, i + VIDEO_FILTER_CHUNK);
    const resp = await report(accessToken, {
      startDate,
      endDate,
      metrics: VIDEO_METRICS,
      dimensions: "video",
      filters: `video==${chunk.join(",")}`,
      maxResults: String(VIDEO_FILTER_CHUNK * 2),
    });
    for (const r of rowsAsRecords(resp)) {
      const minutes = num(r.estimatedMinutesWatched);
      out[String(r.video)] = {
        views: num(r.views),
        watchTimeSec: minutes === undefined ? undefined : minutes * 60,
        avgWatchTimeSec: num(r.averageViewDuration),
        avgViewPercentage: num(r.averageViewPercentage),
        likes: num(r.likes),
        comments: num(r.comments),
        shares: num(r.shares),
        follows: num(r.subscribersGained),
      };
    }
  }

  return out;
}

// ── Audience ─────────────────────────────────────────────────────────────────

/**
 * Demographics and geography.
 *
 * Age and gender come back as viewerPercentage and are genuinely percentages.
 * Country and device come back as view COUNTS and are converted to shares here,
 * because mixing units in one table is what the new `unit` column exists to
 * prevent — these are normalised rather than passed through raw.
 */
export async function fetchAudienceBreakdowns(
  accessToken: string,
  now: Date = new Date(),
  windowDays = 90,
): Promise<{ rows: AudienceRow[]; observed: ObservedCapabilityMap }> {
  const endDate = isoDay(new Date(now.getTime() - LAG_DAYS * 86_400_000));
  const startDate = isoDay(new Date(now.getTime() - windowDays * 86_400_000));
  const rows: AudienceRow[] = [];

  const demographics = await report(accessToken, {
    startDate,
    endDate,
    metrics: "viewerPercentage",
    dimensions: "ageGroup,gender",
  });

  if (demographics === null) {
    return { rows: [], observed: {} };
  }

  const byAge = new Map<string, number>();
  const byGender = new Map<string, number>();
  for (const r of rowsAsRecords(demographics)) {
    const pct = num(r.viewerPercentage) ?? 0;
    // "age18-24" → "18-24", matching the bucket format the UI already renders.
    const age = String(r.ageGroup).replace(/^age/, "");
    const gender = String(r.gender).toLowerCase();
    byAge.set(age, (byAge.get(age) ?? 0) + pct);
    byGender.set(gender, (byGender.get(gender) ?? 0) + pct);
  }
  for (const [bucket, value] of byAge) {
    rows.push({ dimension: "age", bucket, value, unit: "percent", audience: "reached" });
  }
  for (const [bucket, value] of byGender) {
    rows.push({ dimension: "gender", bucket, value, unit: "percent", audience: "reached" });
  }

  rows.push(...(await shareOf(accessToken, startDate, endDate, "country", "country")));
  rows.push(...(await shareOf(accessToken, startDate, endDate, "deviceType", "device")));

  return { rows, observed: {} };
}

/** Run a count-based breakdown and convert it to percentage shares. */
async function shareOf(
  accessToken: string,
  startDate: string,
  endDate: string,
  dimension: string,
  target: AudienceRow["dimension"],
): Promise<AudienceRow[]> {
  const resp = await report(accessToken, {
    startDate,
    endDate,
    metrics: "views",
    dimensions: dimension,
    sort: "-views",
    maxResults: "25",
  });
  const records = rowsAsRecords(resp);
  const total = records.reduce((s, r) => s + (num(r.views) ?? 0), 0);
  if (total <= 0) return [];
  return records
    .map((r) => ({
      dimension: target,
      bucket: String(r[dimension]).toLowerCase(),
      value: ((num(r.views) ?? 0) / total) * 100,
      unit: "percent" as const,
      audience: "reached" as const,
    }))
    .filter((r) => r.value > 0);
}

/**
 * Traffic sources, as a share of views. Not an audience dimension — returned
 * separately so callers can choose whether to persist it.
 */
export async function fetchTrafficSources(
  accessToken: string,
  now: Date = new Date(),
  windowDays = 90,
): Promise<Array<{ source: string; views: number; sharePct: number }>> {
  const endDate = isoDay(new Date(now.getTime() - LAG_DAYS * 86_400_000));
  const startDate = isoDay(new Date(now.getTime() - windowDays * 86_400_000));
  const resp = await report(accessToken, {
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched",
    dimensions: "insightTrafficSourceType",
    sort: "-views",
    maxResults: "25",
  });
  const records = rowsAsRecords(resp);
  const total = records.reduce((s, r) => s + (num(r.views) ?? 0), 0);
  if (total <= 0) return [];
  return records.map((r) => {
    const views = num(r.views) ?? 0;
    return {
      source: String(r.insightTrafficSourceType).toLowerCase(),
      views,
      sharePct: (views / total) * 100,
    };
  });
}
