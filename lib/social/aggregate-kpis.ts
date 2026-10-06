import { METRIC_KEYS, type MetricKey } from "./capabilities";
import { delta, type MetricDelta } from "./metrics";

// One account's KPIs rolled up across several: the Social Tracker overview
// (app/api/social/overview) and the mobile API (lib/mobile/social.ts) both use
// this, so the two can never total the same accounts differently.

/** Metrics that are rates or levels — summing them across accounts is nonsense. */
const NON_ADDITIVE = new Set<MetricKey>([
  "engagementRate", "ctr", "avgViewDurationSec", "avgViewPercentage",
  "followerGrowthRate", "postingFrequency", "viralScore", "healthScore",
]);

/**
 * Roll per-account KPIs into one figure.
 *
 * Counts add. Rates are weighted by each account's followers, because a plain
 * mean would let a 200-follower account with a freak 40% engagement rate drag
 * the portfolio number above every real one.
 *
 * A metric no selected account supports stays unavailable rather than becoming
 * a misleading zero.
 */
export function aggregateKpis(
  perAccount: Array<{ kpis: Record<MetricKey, MetricDelta & { available: string; unit: string }>; account: { followers: number | null } }>,
): Record<string, MetricDelta & { available: string; unit: string; accountsReporting: number }> {
  const out: Record<string, MetricDelta & { available: string; unit: string; accountsReporting: number }> = {};

  for (const metric of METRIC_KEYS) {
    const entries = perAccount.map((p) => ({ kpi: p.kpis[metric], weight: p.account.followers ?? 0 }));
    const usable = entries.filter((e) => e.kpi.available !== "unavailable");
    const unit = entries[0]?.kpi.unit ?? "count";

    if (usable.length === 0) {
      out[metric] = { current: null, previous: null, deltaPct: null, available: "unavailable", unit, accountsReporting: 0 };
      continue;
    }

    const available = usable.some((e) => e.kpi.available === "native") ? "native" : "derived";
    const reporting = usable.filter((e) => e.kpi.current !== null);

    const combine = (pick: (k: MetricDelta) => number | null): number | null => {
      const withValue = usable.filter((e) => pick(e.kpi) !== null);
      if (withValue.length === 0) return null;
      if (!NON_ADDITIVE.has(metric)) return withValue.reduce((s, e) => s + pick(e.kpi)!, 0);
      const totalWeight = withValue.reduce((s, e) => s + e.weight, 0);
      // No follower data to weight by — fall back to a plain mean rather than
      // dividing by zero.
      if (totalWeight <= 0) return withValue.reduce((s, e) => s + pick(e.kpi)!, 0) / withValue.length;
      return withValue.reduce((s, e) => s + pick(e.kpi)! * e.weight, 0) / totalWeight;
    };

    out[metric] = {
      ...delta(combine((k) => k.current), combine((k) => k.previous)),
      available,
      unit,
      accountsReporting: reporting.length,
    };
  }

  return out;
}
