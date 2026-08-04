// Benchmarking and cross-account comparison.

import { mean } from "./series";

/**
 * Typical engagement-rate bands by platform, as a percentage of reach/views.
 * Static and clearly labelled "typical" in the UI — these are industry rules of
 * thumb, not measurements of our own user base.
 */
export const ER_BENCHMARKS: Record<string, { low: number; high: number }> = {
  instagram: { low: 1, high: 3.5 },
  facebook: { low: 0.5, high: 2 },
  youtube: { low: 2, high: 5 },
};

export type BenchmarkVerdict = "below" | "typical" | "above" | "unknown";

export interface BenchmarkResult {
  verdict: BenchmarkVerdict;
  low: number | null;
  high: number | null;
}

/** Where an engagement rate sits against its platform's typical band. */
export function benchmark(engagementRate: number | null, provider: string): BenchmarkResult {
  const band = ER_BENCHMARKS[provider];
  if (!band || engagementRate === null) return { verdict: "unknown", low: null, high: null };
  const verdict: BenchmarkVerdict =
    engagementRate < band.low ? "below" : engagementRate > band.high ? "above" : "typical";
  return { verdict, low: band.low, high: band.high };
}

/**
 * Compare a value against the account's OWN trailing history rather than an
 * industry band. Usually the more actionable of the two: "down 30% on your
 * normal" beats "below the industry average" for a creator who has never been
 * near the industry average.
 */
export function vsOwnBaseline(
  current: number | null,
  history: number[],
): { baseline: number | null; deltaPct: number | null; verdict: BenchmarkVerdict } {
  const baseline = mean(history);
  if (current === null || baseline === null || baseline === 0) {
    return { baseline, deltaPct: null, verdict: "unknown" };
  }
  const deltaPct = ((current - baseline) / Math.abs(baseline)) * 100;
  // ±10% of your own norm is noise, not a signal.
  const verdict: BenchmarkVerdict = deltaPct < -10 ? "below" : deltaPct > 10 ? "above" : "typical";
  return { baseline, deltaPct, verdict };
}

export interface PlatformComparisonRow {
  accountId: string;
  provider: string;
  label: string;
  followers: number | null;
  engagementRate: number | null;
  /** Share of the selection's total followers, 0–100. */
  followerShare: number | null;
}

/**
 * Rank connected accounts side by side. `followerShare` is null when the total
 * is zero, rather than dividing by it.
 */
export function comparePlatforms(
  rows: Array<Omit<PlatformComparisonRow, "followerShare">>,
): PlatformComparisonRow[] {
  const total = rows.reduce((s, r) => s + (r.followers ?? 0), 0);
  return rows
    .map((r) => ({
      ...r,
      followerShare: total > 0 && r.followers != null ? (r.followers / total) * 100 : null,
    }))
    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
}

export interface CompetitorComparison {
  id: string;
  handle: string;
  provider: string;
  followers: number | null;
  /** Their followers minus ours on the same platform. */
  followerGap: number | null;
  engagementRate: number | null;
  postsPerWeek: number | null;
  /** Followers gained over the comparison window. */
  weekGrowth: number | null;
}

/**
 * Competitors against our own account on the same platform. Where we have no
 * account on that platform the gap is null rather than being compared against
 * an unrelated one.
 */
export function compareCompetitors(
  own: Array<{ provider: string; followers: number | null }>,
  competitors: Array<Omit<CompetitorComparison, "followerGap">>,
): CompetitorComparison[] {
  const ownByProvider = new Map<string, number>();
  for (const a of own) {
    if (a.followers == null) continue;
    // Several accounts on one platform: compare against the largest.
    ownByProvider.set(a.provider, Math.max(ownByProvider.get(a.provider) ?? 0, a.followers));
  }
  return competitors
    .map((c) => {
      const mine = ownByProvider.get(c.provider);
      return {
        ...c,
        followerGap: mine != null && c.followers != null ? c.followers - mine : null,
      };
    })
    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
}
