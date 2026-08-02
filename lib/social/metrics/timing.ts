// When to post. Pure — the timezone arrives as an explicit IANA string, so the
// same posts produce the same heatmap on the server, in a test, and in a PDF.

import { localHour, localWeekday, type TimeZone } from "./dates";
import { postEngagementRate } from "./posts";
import { mean, stddev } from "./series";
import type { PostRow } from "./types";

/** Hours per heatmap column. 4 gives 6 columns — readable on a phone. */
export const HOUR_BLOCK = 4;
export const BLOCKS_PER_DAY = 24 / HOUR_BLOCK;

export interface BestTimeCell {
  /** 0 (Sunday) – 6 (Saturday), in the target timezone. */
  day: number;
  /** 0–5, four-hour block starting at local midnight. */
  block: number;
  avgEngagementRate: number;
  count: number;
}

export interface BestTimes {
  cells: BestTimeCell[];
  best: BestTimeCell | null;
}

/**
 * Bucket the account's own history into weekday × 4-hour cells and average
 * engagement in each.
 *
 * `tz` accepts either an IANA name ("Asia/Kolkata") or a UTC offset in minutes,
 * for compatibility with the existing client which sends
 * `-new Date().getTimezoneOffset()`. The IANA form is correct across DST and is
 * what new callers should pass.
 */
export function computeBestTimes(posts: PostRow[], tz: TimeZone | number = "UTC"): BestTimes {
  const byCell = new Map<string, number[]>();

  for (const p of posts) {
    const er = postEngagementRate(p);
    if (er === null || !p.publishedAt) continue;

    let day: number;
    let hour: number;
    if (typeof tz === "number") {
      const shifted = new Date(p.publishedAt.getTime() + tz * 60_000);
      day = shifted.getUTCDay();
      hour = shifted.getUTCHours();
    } else {
      day = localWeekday(p.publishedAt, tz);
      hour = localHour(p.publishedAt, tz);
    }

    const key = `${day}:${Math.floor(hour / HOUR_BLOCK)}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(er);
    else byCell.set(key, [er]);
  }

  const cells = [...byCell.entries()]
    .map(([key, ers]) => {
      const [day, block] = key.split(":").map(Number);
      return { day, block, avgEngagementRate: mean(ers)!, count: ers.length };
    })
    .sort((a, b) => a.day - b.day || a.block - b.block);

  // Prefer cells backed by a repeatable signal; fall back to any cell so a new
  // account still sees something rather than an empty panel.
  const repeatable = cells.filter((c) => c.count >= 2);
  const pool = repeatable.length > 0 ? repeatable : cells;
  const best =
    pool.length > 0 ? pool.reduce((a, b) => (b.avgEngagementRate > a.avgEngagementRate ? b : a)) : null;

  return { cells, best };
}

/** The top `limit` cells with at least `minCount` posts behind them. */
export function rankedTimeSlots(times: BestTimes, limit = 3, minCount = 2): BestTimeCell[] {
  return times.cells
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
    .slice(0, limit);
}

/** Posts per week over the window. */
export function postingFrequency(postCount: number, rangeDays: number): number | null {
  if (rangeDays <= 0) return null;
  return (postCount / rangeDays) * 7;
}

export interface PostingConsistency {
  /** 0–100. High means an even cadence; low means bursts and silences. */
  score: number | null;
  /** Mean gap between consecutive posts, in days. */
  avgGapDays: number | null;
  /** Standard deviation of those gaps. */
  gapStdDevDays: number | null;
  /** Days since the most recent post, relative to `now`. */
  daysSinceLastPost: number | null;
}

/**
 * How evenly the account publishes. Scored from the coefficient of variation of
 * the gaps between posts, so it is scale-free: one post a week and one a day both
 * score 100 if they are regular.
 *
 * Needs at least three posts (two gaps) to say anything, and returns nulls below
 * that rather than guessing.
 */
export function postingConsistency(posts: PostRow[], now: Date): PostingConsistency {
  const times = posts
    .map((p) => p.publishedAt)
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime())
    .sort((a, b) => a - b);

  const empty: PostingConsistency = {
    score: null,
    avgGapDays: null,
    gapStdDevDays: null,
    daysSinceLastPost: null,
  };
  if (times.length === 0) return empty;

  const daysSinceLastPost = (now.getTime() - times[times.length - 1]) / 86_400_000;
  if (times.length < 3) return { ...empty, daysSinceLastPost };

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push((times[i] - times[i - 1]) / 86_400_000);

  const avgGapDays = mean(gaps)!;
  const gapStdDevDays = stddev(gaps) ?? 0;
  if (avgGapDays <= 0) return { score: null, avgGapDays, gapStdDevDays, daysSinceLastPost };

  // CV of 0 → perfectly regular → 100. CV of 1 or worse → 0.
  const cv = gapStdDevDays / avgGapDays;
  const score = Math.max(0, Math.min(100, (1 - cv) * 100));

  return { score, avgGapDays, gapStdDevDays, daysSinceLastPost };
}

/**
 * A generic weekday × block heatmap over any per-post metric, for surfaces other
 * than engagement (reach by hour, views by hour). Cells with no posts are absent
 * rather than zero, so the UI can distinguish "never posted then" from "posted
 * and it flopped".
 */
export function heatmap(
  posts: PostRow[],
  value: (p: PostRow) => number | null,
  tz: TimeZone = "UTC",
): Array<{ day: number; block: number; value: number; count: number }> {
  const byCell = new Map<string, number[]>();
  for (const p of posts) {
    if (!p.publishedAt) continue;
    const v = value(p);
    if (v === null || !Number.isFinite(v)) continue;
    const key = `${localWeekday(p.publishedAt, tz)}:${Math.floor(localHour(p.publishedAt, tz) / HOUR_BLOCK)}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(v);
    else byCell.set(key, [v]);
  }
  return [...byCell.entries()]
    .map(([key, values]) => {
      const [day, block] = key.split(":").map(Number);
      return { day, block, value: mean(values)!, count: values.length };
    })
    .sort((a, b) => a.day - b.day || a.block - b.block);
}
