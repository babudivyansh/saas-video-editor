// Time-series primitives. Pure, no I/O, no clock access.
//
// Two shapes of source data flow through here and they are NOT interchangeable:
//
//   CUMULATIVE  — SocialAccountSnapshot. Lifetime totals captured at sync time,
//                 monotonic. A window's value is (last − baseline), and the
//                 chart plots the raw running total.
//   DAILY       — SocialDailyMetric. Per-day deltas keyed by calendar date. A
//                 window's value is the SUM of its days.
//
// Applying the wrong reducer to the wrong shape silently produces plausible
// nonsense, so the two paths are named separately rather than sharing a flag.

import { bucketKey, dayKey, eachDay, type Granularity, type TimeZone } from "./dates";

export interface SeriesPoint {
  /** yyyy-mm-dd — the bucket's first local day. */
  date: string;
  value: number;
}

export interface MetricDelta {
  current: number | null;
  /** Equal-length window immediately before the range. */
  previous: number | null;
  /** null when previous is 0 or unknown — a percentage change from zero is meaningless. */
  deltaPct: number | null;
}

export const EMPTY_DELTA: MetricDelta = { current: null, previous: null, deltaPct: null };

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation — a spread measure that outliers don't wreck. */
export function mad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

export function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/** Fraction of `values` at or below `value`, 0–1. */
export function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const below = values.filter((v) => v <= value).length;
  return below / values.length;
}

/**
 * Percentage change, or null where a percentage would mislead.
 *
 * Null on a previous of zero (a change from nothing has no percentage) AND on a
 * NEGATIVE previous. The second case shipped: an account whose net likes went
 * from -2 to -1 rendered "Likes -1, up 50%" with a green arrow. The arithmetic
 * is right and the sentence is nonsense — nobody reads "up 50%" as "still
 * negative, just less so". A metric below zero gets its value and no percentage.
 */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function delta(current: number | null, previous: number | null): MetricDelta {
  return { current, previous, deltaPct: pctChange(current, previous) };
}

// ── Daily rows (SocialDailyMetric) ───────────────────────────────────────────

export interface DatedValue {
  /** yyyy-mm-dd. */
  date: string;
  value: number;
}

/**
 * Roll per-day values up to the requested granularity by summing. Correct for
 * additive metrics (views gained, likes, posts published) — NOT for levels like
 * follower count, which want `bucketLast`.
 */
export function bucketSum(
  rows: DatedValue[],
  granularity: Granularity,
  tz: TimeZone = "UTC",
): SeriesPoint[] {
  return bucketBy(rows, granularity, tz, (values) => sum(values));
}

/** Roll up by taking each bucket's last value — for cumulative levels. */
export function bucketLast(
  rows: DatedValue[],
  granularity: Granularity,
  tz: TimeZone = "UTC",
): SeriesPoint[] {
  return bucketBy(rows, granularity, tz, (values) => values[values.length - 1]);
}

/** Roll up by averaging — for rates, where summing would be nonsense. */
export function bucketMean(
  rows: DatedValue[],
  granularity: Granularity,
  tz: TimeZone = "UTC",
): SeriesPoint[] {
  return bucketBy(rows, granularity, tz, (values) => mean(values) ?? 0);
}

function bucketBy(
  rows: DatedValue[],
  granularity: Granularity,
  tz: TimeZone,
  reduce: (values: number[]) => number,
): SeriesPoint[] {
  if (rows.length === 0) return [];
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const buckets = new Map<string, number[]>();
  for (const row of ordered) {
    if (!Number.isFinite(row.value)) continue;
    // Noon avoids any chance of the parsed instant landing on the previous local day.
    const key =
      granularity === "day" ? row.date : bucketKey(new Date(`${row.date}T12:00:00Z`), granularity, tz);
    const existing = buckets.get(key);
    if (existing) existing.push(row.value);
    else buckets.set(key, [row.value]);
  }
  return [...buckets.entries()]
    .map(([date, values]) => ({ date, value: reduce(values) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Insert missing days as `fill`. Providers omit zero-activity days entirely, so
 * without this a chart draws a straight line across a gap and implies activity
 * that did not happen.
 *
 * Only meaningful at day granularity; weekly and monthly buckets are returned
 * untouched.
 */
export function fillGaps(
  points: SeriesPoint[],
  from: Date,
  to: Date,
  tz: TimeZone = "UTC",
  fill = 0,
): SeriesPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  return eachDay(from, to, tz).map((date) => ({ date, value: byDate.get(date) ?? fill }));
}

/** Carry the last known value forward instead of zero — for cumulative levels. */
export function fillForward(
  points: SeriesPoint[],
  from: Date,
  to: Date,
  tz: TimeZone = "UTC",
): SeriesPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const out: SeriesPoint[] = [];
  let last: number | null = null;
  for (const date of eachDay(from, to, tz)) {
    const v = byDate.get(date);
    if (v !== undefined) last = v;
    if (last !== null) out.push({ date, value: last });
  }
  return out;
}

/** Trailing simple moving average over `window` points. Smooths noisy daily data. */
export function rollingMean(points: SeriesPoint[], window: number): SeriesPoint[] {
  if (window <= 1) return points;
  const out: SeriesPoint[] = [];
  const buffer: number[] = [];
  for (const p of points) {
    buffer.push(p.value);
    if (buffer.length > window) buffer.shift();
    out.push({ date: p.date, value: mean(buffer)! });
  }
  return out;
}

// ── Cumulative rows (SocialAccountSnapshot) ──────────────────────────────────

export interface CumulativeRow {
  capturedAt: Date;
  value: number;
}

/**
 * Change across a window: the last value inside it minus the closest value at or
 * before its start. Using the pre-window baseline is what makes a quiet week read
 * as 0 rather than as "no data".
 *
 * Assumes a monotonic cumulative series. Do NOT feed daily deltas to this.
 */
export function windowDelta(rows: CumulativeRow[], from: Date, to: Date): number | null {
  let baseline: number | null = null;
  let last: number | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const t = row.capturedAt.getTime();
    if (t <= from.getTime()) baseline = row.value;
    else if (t <= to.getTime()) last = row.value;
  }
  if (last === null || baseline === null) return null;
  return last - baseline;
}

/** The most recent value at or before `atOrBefore`. */
export function latestValue(rows: CumulativeRow[], atOrBefore: Date): number | null {
  let out: number | null = null;
  for (const row of rows) {
    if (Number.isFinite(row.value) && row.capturedAt.getTime() <= atOrBefore.getTime()) {
      out = row.value;
    }
  }
  return out;
}

/** One point per local day, taking that day's last capture. */
export function cumulativeSeries(
  rows: CumulativeRow[],
  from: Date,
  tz: TimeZone = "UTC",
): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.value) || row.capturedAt.getTime() < from.getTime()) continue;
    byDay.set(dayKey(row.capturedAt, tz), row.value); // ascending input → last write wins
  }
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Turn a cumulative series into per-period gains. Negative steps clamp to 0. */
export function toDeltaSeries(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 1; i < points.length; i += 1) {
    out.push({ date: points[i].date, value: Math.max(0, points[i].value - points[i - 1].value) });
  }
  return out;
}

// ── Growth ───────────────────────────────────────────────────────────────────

/**
 * Compound daily growth rate as a percentage, from first to last over `days`.
 * Returns null when the series is too short or starts at or below zero, where
 * the ratio is undefined.
 */
export function compoundGrowth(first: number, last: number, days: number): number | null {
  if (days <= 0 || first <= 0 || last <= 0) return null;
  return ((last / first) ** (1 / days) - 1) * 100;
}

export function firstValue(points: SeriesPoint[]): number | null {
  return points.length > 0 ? points[0].value : null;
}

export function lastValue(points: SeriesPoint[]): number | null {
  return points.length > 0 ? points[points.length - 1].value : null;
}
