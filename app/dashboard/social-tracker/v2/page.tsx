// Overview — "how am I doing?"
//
// The question the product exists to answer, and the one the v1 dashboard could
// not: analytics were nested per account behind a tab, so comparing two accounts
// meant scrolling and remembering numbers.

import { requireServerSubscriber } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { mergeCapabilities, METRIC_KEYS, type MetricKey, type Support } from "@/lib/social/capabilities";
import { capabilityMap } from "@/lib/social/capabilities";
import { loadAccountKpis, loadAccounts, loadSeries } from "@/lib/social/queries";
import { ER_BENCHMARKS, delta, rangeBounds } from "@/lib/social/metrics";
import { KpiGrid, type KpiEntry } from "../components/KpiGrid";
import { TrendSection } from "../components/TrendSection";
import { PlatformOverview } from "../components/PlatformOverview";

export const dynamic = "force-dynamic";

const VALID_RANGES = [7, 30, 90, 365];

export default async function OverviewPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and MUST be awaited. The v15 sync shim
  // was removed entirely.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireServerSubscriber();
  if (!auth) redirect("/dashboard/social-tracker");

  const params = await searchParams;
  const rangeRaw = Number(first(params.range) ?? 30);
  const range = VALID_RANGES.includes(rangeRaw) ? rangeRaw : 30;
  const granularity = (first(params.granularity) ?? "day") as "day" | "week" | "month";
  const selectedIds = first(params.accounts)?.split(",").filter(Boolean);

  const accounts = await loadAccounts(auth.userId, selectedIds);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" strokeLinecap="round" />
            <path d="m7 14 4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="No connected accounts yet"
        subtitle="Connect YouTube, Instagram or Facebook to see followers, reach and engagement in one place."
        action={{ label: "Connect an account", href: "/dashboard/social-tracker/v2/settings" }}
      />
    );
  }

  const now = new Date();
  const { from, to } = rangeBounds(range, now);
  const tz = accounts[0].timezone ?? "UTC";

  const perAccount = await Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? tz)));
  const capabilities = mergeCapabilities(accounts.map((a) => capabilityMap(a.provider, a.observed)));
  const totals = aggregate(perAccount, capabilities);

  // Sparkline data for the two tiles where a trend adds most.
  const [followerSeries, viewsSeries] = await Promise.all([
    loadSeries(accounts[0], "followers", from, to, granularity, tz),
    loadSeries(accounts[0], "views", from, to, granularity, tz),
  ]);

  // A single-platform selection can show its industry band; a mixed one cannot,
  // because the bands differ and averaging them would be meaningless.
  const providers = new Set(accounts.map((a) => a.provider));
  const benchmark = providers.size === 1 ? (ER_BENCHMARKS[accounts[0].provider] ?? null) : null;

  return (
    <div className="space-y-8">
      <KpiGrid
        kpis={totals}
        derived={{
          averageViews: perAccount.length === 1 ? perAccount[0].derived.averageViews : undefined,
          dailyGrowth: perAccount[0].derived.dailyGrowth,
          weeklyGrowth: perAccount[0].derived.weeklyGrowth,
          monthlyGrowth: perAccount[0].derived.monthlyGrowth,
        }}
        sparklines={{ followers: followerSeries.points, views: viewsSeries.points }}
        benchmark={benchmark}
      />

      <TrendSection
        followers={followerSeries.points}
        views={viewsSeries.points}
        rangeDays={range}
        granularity={granularity}
      />

      <PlatformOverview
        accounts={perAccount.map((p) => ({
          id: p.account.id,
          provider: p.account.provider,
          label: p.account.displayName ?? p.account.username ?? p.account.provider,
          avatarUrl: p.account.avatarUrl,
          followers: p.account.followers,
          engagementRate: p.kpis.engagementRate.current,
          status: p.account.status,
          lastSyncedAt: p.account.lastSyncedAt?.toISOString() ?? null,
          lastSyncStatus: p.account.lastSyncStatus,
          lastSyncError: p.account.lastSyncError,
          healthScore: p.account.healthScore,
          dataCompleteness: p.completeness,
        }))}
      />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Metrics that are rates or levels — summing across accounts is nonsense. */
const NON_ADDITIVE = new Set<MetricKey>([
  "engagementRate", "ctr", "avgViewDurationSec", "avgViewPercentage",
  "followerGrowthRate", "postingFrequency", "viralScore", "healthScore",
]);

/**
 * Roll per-account KPIs into portfolio figures.
 *
 * Counts add. Rates are weighted by followers — a plain mean would let a
 * 200-follower account with a freak 40% engagement rate drag the portfolio
 * number above every real one.
 */
function aggregate(
  perAccount: Awaited<ReturnType<typeof loadAccountKpis>>[],
  capabilities: Record<MetricKey, Support>,
): Partial<Record<MetricKey, KpiEntry>> {
  const out: Partial<Record<MetricKey, KpiEntry>> = {};

  for (const metric of METRIC_KEYS) {
    const entries = perAccount.map((p) => ({ kpi: p.kpis[metric], weight: p.account.followers ?? 0 }));
    const usable = entries.filter((e) => e.kpi.available !== "unavailable");
    const unit = entries[0]?.kpi.unit ?? "count";

    if (usable.length === 0) {
      out[metric] = {
        current: null, previous: null, deltaPct: null,
        available: "unavailable", unit,
        // Reason comes from the first account, which is enough to explain the
        // limitation for a single-platform selection and honest for a mixed one.
        reason: entries[0]?.kpi.reason,
      };
      continue;
    }

    const combine = (pick: (k: (typeof usable)[number]["kpi"]) => number | null): number | null => {
      const withValue = usable.filter((e) => pick(e.kpi) !== null);
      if (withValue.length === 0) return null;
      if (!NON_ADDITIVE.has(metric)) return withValue.reduce((s, e) => s + pick(e.kpi)!, 0);
      const totalWeight = withValue.reduce((s, e) => s + e.weight, 0);
      if (totalWeight <= 0) return withValue.reduce((s, e) => s + pick(e.kpi)!, 0) / withValue.length;
      return withValue.reduce((s, e) => s + pick(e.kpi)! * e.weight, 0) / totalWeight;
    };

    out[metric] = {
      ...delta(combine((k) => k.current), combine((k) => k.previous)),
      available: capabilities[metric],
      unit,
      accountsReporting: usable.filter((e) => e.kpi.current !== null).length,
    };
  }

  return out;
}
