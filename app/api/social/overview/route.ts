import type { NextRequest } from "next/server";
import { assertOwnedAccounts, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, userVersion } from "@/lib/social/cache";
import { overviewQuerySchema } from "@/lib/social/schemas";
import { combinedCapabilities, loadAccountKpis, loadAccounts } from "@/lib/social/queries";
import { METRIC_KEYS, type MetricKey } from "@/lib/social/capabilities";
import { comparePlatforms, delta, rangeBounds, type MetricDelta } from "@/lib/social/metrics";

// GET /api/social/overview?accountIds=a,b&range=30&tz=Asia/Kolkata
//
// The executive view: every KPI aggregated across the selected accounts, the
// per-platform split, and account health. This is the question the product
// exists to answer — "how am I doing?" — and until now it could not be asked,
// because analytics were nested per account behind a tab.
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, overviewQuerySchema);
  if (q.accountIds?.length) await assertOwnedAccounts(auth.userId, q.accountIds);

  const version = await userVersion(auth.userId);
  const cacheKey = `${keys.overview(auth.userId, version)}:${q.accountIds?.join(",") ?? "all"}:${q.range}:${q.tz}`;

  const payload = await cached(cacheKey, CACHE_TTL, async () => {
    const accounts = await loadAccounts(auth.userId, q.accountIds);
    if (accounts.length === 0) {
      return { accounts: [], totals: {}, capabilities: {}, platforms: [], range: null };
    }

    const now = new Date();
    const { from, to } = rangeBounds(q.range, now);
    const perAccount = await Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? q.tz)));

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days: q.range, tz: q.tz },
      capabilities: combinedCapabilities(accounts),
      totals: aggregate(perAccount),
      platforms: comparePlatforms(
        accounts.map((a) => ({
          accountId: a.id,
          provider: a.provider,
          label: a.displayName ?? a.username ?? a.provider,
          followers: a.followers,
          engagementRate:
            perAccount.find((p) => p.account.id === a.id)?.kpis.engagementRate.current ?? null,
        })),
      ),
      accounts: perAccount.map((p) => ({
        id: p.account.id,
        provider: p.account.provider,
        username: p.account.username,
        displayName: p.account.displayName,
        avatarUrl: p.account.avatarUrl,
        followers: p.account.followers,
        healthScore: p.account.healthScore,
        // Sync state we already stored and never surfaced: a partial sync used
        // to look identical to a healthy one.
        status: p.account.status,
        lastSyncedAt: p.account.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: p.account.lastSyncStatus,
        lastSyncError: p.account.lastSyncError,
        dataCompleteness: p.completeness,
        capabilities: p.capabilities,
        kpis: p.kpis,
        derived: p.derived,
      })),
    };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:overview:${auth.userId}`, max: 60, windowSec: 60 },
});

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
function aggregate(
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
