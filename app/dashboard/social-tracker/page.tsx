// Overview: how am I doing, what's next, and what worked.
//
// Four headline numbers, one trend, the posts waiting on you, your best posts,
// the AI summary and who's watching. Everything else is one click away under
// "More metrics" instead of competing for the first screen.

import Link from "next/link";
import { EmptyAccounts } from "./components/EmptyAccounts";
import { mergeCapabilities, METRIC_KEYS, type MetricKey, type Support } from "@/lib/social/capabilities";
import { capabilityMap } from "@/lib/social/capabilities";
import { loadAccountKpis, loadAudience, loadSeries } from "@/lib/social/queries";
import { listPosts } from "@/lib/mobile/posts";
import { accountLabel, loadViewContext, type SearchParams } from "./shared";
import { ER_BENCHMARKS, delta, postEngagementRate, rangeBounds } from "@/lib/social/metrics";
import { prisma } from "@/lib/prisma";
import { KpiGrid, KpiHeroRow, type KpiEntry } from "./components/KpiGrid";
import { TrendChart } from "./components/TrendChart";
import { AiInsightsPanel } from "./components/AiInsightsPanel";
import { PlannedPosts, type PlannedPost } from "./components/PlannedPosts";
import { TopPosts } from "./components/TopPosts";
import { AudienceCard } from "./components/AudienceCard";
import { Button } from "@/app/components/ui/Button";
import { getToolConfig } from "@/lib/tool-config";
import type { ExecutiveSummary } from "@/lib/social/ai/schemas";

export const dynamic = "force-dynamic";

const UP_NEXT = 4;
const TOP = 5;

export default async function OverviewPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and MUST be awaited.
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { userId, accounts, allAccounts, filters } = await loadViewContext(params);
  if (allAccounts.length === 0) return <EmptyAccounts />;

  const { range, granularity } = filters;
  const now = new Date();
  const { from, to } = rangeBounds(range, now);
  const tz = accounts[0].timezone ?? "UTC";
  const single = accounts.length === 1 ? accounts[0] : null;
  const ids = accounts.map((a) => a.id);

  // Everything this page reads, in one round of parallel queries.
  const [perAccount, followerSeriesList, viewsSeriesList, plan, periodPosts, audience, execReportCost, storedInsight] = await Promise.all([
    Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? tz))),
    Promise.all(accounts.map((a) => loadSeries(a, "followers", from, to, granularity, tz))),
    Promise.all(accounts.map((a) => loadSeries(a, "views", from, to, granularity, tz))),
    listPosts(userId, { limit: 100 }),
    prisma.socialPost.findMany({
      where: { accountId: { in: ids }, publishedAt: { gte: from, lte: to } },
      orderBy: { views: { sort: "desc", nulls: "last" } },
      take: TOP,
    }),
    single ? loadAudience(single.id, new Date(now.getTime() - 45 * 86_400_000)) : Promise.resolve(null),
    getToolConfig("social-exec-report").then((c) => c.creditCost),
    single
      ? prisma.aiInsight.findFirst({
          where: { accountId: single.id, kind: "executive_summary_weekly" },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  // The trend covers every account in view, not just the first one: views add
  // per day, and a follower count carries forward until its next reading.
  const followerSeries = { points: sumSeries(followerSeriesList.map((s) => s.points), true) };
  const viewsSeries = { points: sumSeries(viewsSeriesList.map((s) => s.points), false) };

  const capabilities = mergeCapabilities(accounts.map((a) => capabilityMap(a.provider, a.observed)));
  const totals = aggregate(perAccount, capabilities);

  // The follower TILE reads the last daily row that carried a follower count;
  // when a provider sends snapshots but no daily follower column (YouTube),
  // fall back to the account's stored follower count rather than a dash.
  if (totals.followers && totals.followers.current === null) {
    const known = accounts.map((a) => a.followers).filter((f): f is number => typeof f === "number");
    if (known.length > 0) {
      totals.followers = { ...totals.followers, current: known.reduce((s, f) => s + f, 0), available: "derived" };
    }
  }

  const providers = new Set(accounts.map((a) => a.provider));
  const benchmark = providers.size === 1 ? (ER_BENCHMARKS[accounts[0].provider] ?? null) : null;

  // Up next: what's waiting on you first, then what's going out soonest.
  const inScope = new Set(ids);
  const upNext: PlannedPost[] = plan.posts
    .filter((p) => inScope.has(p.account.id))
    .filter((p) => ["your_turn", "failed", "missed", "scheduled", "posting"].includes(p.status))
    .sort((a, b) => rank(a.status) - rank(b.status) || (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .slice(0, UP_NEXT)
    .map((p) => ({ ...p, videoUrl: null }));

  // Top posts of the period; the latest ones if nothing went out in it.
  const latest = periodPosts.length === 0;
  const topRows = latest
    ? await prisma.socialPost.findMany({
        where: { accountId: { in: ids }, publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: TOP,
      })
    : periodPosts;

  const storedSummary = (storedInsight?.content ?? null) as ExecutiveSummary | null;

  return (
    <div className="flex flex-col gap-4">
      <KpiHeroRow kpis={totals} sparklines={{ followers: followerSeries.points, views: viewsSeries.points }} benchmark={benchmark} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TrendChart views={viewsSeries.points} followers={followerSeries.points} rangeDays={range} granularity={granularity} />
        </div>
        <section aria-labelledby="up-next-heading" className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="up-next-heading" className="text-sm font-semibold text-fg">
              Up next
            </h2>
            <Link href="/dashboard/social-tracker/posts?filter=scheduled" prefetch={false} className="text-xs font-semibold text-brand hover:underline">
              All →
            </Link>
          </div>
          <PlannedPosts
            compact
            posts={upNext}
            empty={
              <div className="py-4 text-center">
                <p className="text-xs text-fg-muted">Nothing scheduled.</p>
                <div className="mt-3">
                  <Button size="sm" href="/dashboard/social-tracker/new" prefetch={false}>
                    Schedule a clip
                  </Button>
                </div>
              </div>
            }
          />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TopPosts
            latest={latest}
            posts={topRows.map((p) => ({
              id: p.id,
              caption: p.caption,
              thumbnailUrl: p.thumbnailUrl,
              permalink: p.permalink,
              publishedAt: p.publishedAt?.toISOString() ?? null,
              views: p.views,
              engagementRate: postEngagementRate(p),
              avgViewPercentage: p.avgViewPercentage,
            }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {single ? (
            <AiInsightsPanel
              accountId={single.id}
              accountLabel={accountLabel(single)}
              cost={execReportCost}
              initialSummary={storedSummary}
              generatedAt={storedInsight?.createdAt.toISOString() ?? null}
            />
          ) : (
            <section className="rounded-[var(--radius-card)] border border-dashed border-line p-5">
              <h2 className="text-sm font-semibold text-fg">Weekly summary</h2>
              <p className="mt-1 text-xs text-fg-muted">Pick one account in the switcher above for its AI summary.</p>
            </section>
          )}
          {audience && <AudienceCard rows={audience.rows} />}
        </div>
      </div>

      <details className="group rounded-[var(--radius-card)] border border-line bg-panel">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-fg">
          More metrics
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="border-t border-line p-5">
          <KpiGrid
            kpis={totals}
            derived={{ averageViews: single ? perAccount[0].derived.averageViews : undefined }}
            sparklines={{ followers: followerSeries.points, views: viewsSeries.points }}
            benchmark={benchmark}
          />
        </div>
      </details>
    </div>
  );
}

/**
 * Several accounts' series as one. A flow (views) sums what each reported on
 * a date; a level (followers) carries each account's last reading forward, so
 * a day one account didn't report doesn't read as a drop.
 */
function sumSeries(list: Array<Array<{ date: string; value: number }>>, carryForward: boolean) {
  if (list.length === 1) return list[0];
  const dates = [...new Set(list.flatMap((points) => points.map((p) => p.date)))].sort();
  const last = list.map(() => null as number | null);
  const byDate = list.map((points) => new Map(points.map((p) => [p.date, p.value])));
  return dates.map((date) => {
    let value = 0;
    byDate.forEach((m, i) => {
      const v = m.get(date);
      if (v !== undefined) last[i] = v;
      value += v ?? (carryForward ? (last[i] ?? 0) : 0);
    });
    return { date, value };
  });
}

/** Things waiting on the person sort above things that will happen anyway. */
function rank(status: string): number {
  return status === "your_turn" || status === "failed" || status === "missed" ? 0 : 1;
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
