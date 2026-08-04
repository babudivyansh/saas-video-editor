// Growth rates across the periods the KPI grid asks for.

import { daysBetween, type TimeZone } from "./dates";
import { compoundGrowth, firstValue, lastValue, type SeriesPoint } from "./series";

export interface GrowthRates {
  /** Percent per day, compounded — the scale-free comparison. */
  daily: number | null;
  /** Percent change over the trailing 7 days. */
  weekly: number | null;
  /** Percent change over the trailing 30 days. */
  monthly: number | null;
  /** Percent change across the whole series. */
  total: number | null;
  /** Absolute change across the whole series. */
  absolute: number | null;
}

const EMPTY: GrowthRates = { daily: null, weekly: null, monthly: null, total: null, absolute: null };

function changeOverLast(points: SeriesPoint[], days: number): number | null {
  if (points.length < 2) return null;
  // Points are daily; take the value `days` back, or the earliest we have.
  const index = Math.max(0, points.length - 1 - days);
  const from = points[index].value;
  const to = points[points.length - 1].value;
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * Growth over a cumulative level series (follower count, lifetime views).
 *
 * `daily` is compounded rather than "total ÷ days", so a 30-day and a 90-day
 * window produce comparable numbers.
 */
export function growthRates(points: SeriesPoint[]): GrowthRates {
  if (points.length < 2) return EMPTY;

  const first = firstValue(points)!;
  const last = lastValue(points)!;
  const spanDays = Math.max(1, points.length - 1);

  return {
    daily: compoundGrowth(first, last, spanDays),
    weekly: changeOverLast(points, 7),
    monthly: changeOverLast(points, 30),
    total: first === 0 ? null : ((last - first) / Math.abs(first)) * 100,
    absolute: last - first,
  };
}

/**
 * Growth from raw cumulative captures rather than a bucketed series — used when
 * the caller has snapshots and no chart.
 */
export function growthBetween(
  from: { at: Date; value: number } | null,
  to: { at: Date; value: number } | null,
): { absolute: number | null; pct: number | null; daily: number | null } {
  if (!from || !to) return { absolute: null, pct: null, daily: null };
  const absolute = to.value - from.value;
  const pct = from.value === 0 ? null : (absolute / Math.abs(from.value)) * 100;
  const daily = compoundGrowth(from.value, to.value, daysBetween(from.at, to.at));
  return { absolute, pct, daily };
}

/**
 * Projected value `horizonDays` out at the current compounded daily rate.
 *
 * A naive extrapolation, and labelled as such wherever it is shown — for a real
 * projection with a confidence interval use `forecast()`.
 */
export function projectLinear(
  current: number | null,
  dailyRatePct: number | null,
  horizonDays: number,
): number | null {
  if (current === null || dailyRatePct === null || current <= 0) return null;
  return current * (1 + dailyRatePct / 100) ** horizonDays;
}

/**
 * Split a follower series into gained and lost per bucket. Where the provider
 * reports gains and losses directly, prefer those — this only recovers the NET
 * movement, so a day with 100 joins and 100 leaves reads as zero.
 */
export function netFollowerChange(points: SeriesPoint[], _tz: TimeZone = "UTC"): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 1; i < points.length; i += 1) {
    out.push({ date: points[i].date, value: points[i].value - points[i - 1].value });
  }
  return out;
}
