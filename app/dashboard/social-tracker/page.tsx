// Overview — "how am I doing?"
//
// The question the product exists to answer, and the one the v1 dashboard could
// not: analytics were nested per account behind a tab, so comparing two accounts
// meant scrolling and remembering numbers.

import { EmptyState } from "@/app/components/ui/EmptyState";
import { mergeCapabilities, METRIC_KEYS, type MetricKey, type Support } from "@/lib/social/capabilities";
import { capabilityMap } from "@/lib/social/capabilities";
import { loadAccountKpis, loadAccounts, loadSeries } from "@/lib/social/queries";
import { loadViewContext, type SearchParams } from "./shared";
import { AccountPicker } from "./components/AccountPicker";
import { ER_BENCHMARKS, computeAlerts, delta, goalProgress, rangeBounds, type AccountAlert } from "@/lib/social/metrics";
import { METRIC_LABELS } from "@/lib/social/ai/factsheets";
import { prisma } from "@/lib/prisma";
import { Gauge } from "@/app/components/charts";
import { Band, Panel, SPAN } from "@/app/components/dashboard";
import { KpiGrid, KpiHeroRow, type KpiEntry } from "./components/KpiGrid";
import { TrendSection } from "./components/TrendSection";
import { PlatformOverview } from "./components/PlatformOverview";
import { AlertStrip } from "./components/AlertStrip";
import { GoalsStrip } from "./components/GoalsStrip";
import { QuickActions } from "./components/QuickActions";
import { AiInsightsPanel } from "./components/AiInsightsPanel";
import { getToolConfig } from "@/lib/tool-config";
import type { ExecutiveSummary } from "@/lib/social/ai/schemas";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and MUST be awaited. The v15 sync shim
  // was removed entirely.
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { userId, accounts: scoped, allAccounts, filters } = await loadViewContext(params);
  const range = filters.range;
  const granularity = filters.granularity;
  const auth = { userId };

  if (allAccounts.length === 0) {
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
        action={{ label: "Connect an account", href: "/dashboard/social-tracker/settings" }}
      />
    );
  }

  // Account-first: with nothing chosen and more than one account to choose
  // from, ask. A single account skips the picker — offering a choice of one is
  // just an extra click.
  if (filters.scope.kind === "unset" && allAccounts.length > 1) {
    return <AccountPicker accounts={allAccounts} query={queryString(params)} />;
  }

  const accounts =
    filters.scope.kind === "unset" && allAccounts.length === 1 ? allAccounts : scoped;

  const now = new Date();
  const { from, to } = rangeBounds(range, now);
  const tz = accounts[0].timezone ?? "UTC";

  const perAccount = await Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? tz)));
  const capabilities = mergeCapabilities(accounts.map((a) => capabilityMap(a.provider, a.observed)));
  const totals = aggregate(perAccount, capabilities);

  // The follower TILE reads the last daily row that carried a follower count;
  // the account CARD lower down reads SocialAccount.followers, the convenience
  // copy of the newest snapshot. When a provider sends snapshots but no daily
  // follower column — YouTube, today — the tile went blank while the card said
  // 94, on the same screen. The snapshot copy is the better answer of the two,
  // so fall back to it rather than showing a dash next to a number.
  if (totals.followers && totals.followers.current === null) {
    const known = accounts
      .map((a) => a.followers)
      .filter((f): f is number => typeof f === "number");
    if (known.length > 0) {
      totals.followers = {
        ...totals.followers,
        current: known.reduce((s, f) => s + f, 0),
        available: "derived",
      };
    }
  }

  // Sparkline data for the two tiles where a trend adds most.
  const [followerSeries, viewsSeries] = await Promise.all([
    loadSeries(accounts[0], "followers", from, to, granularity, tz),
    loadSeries(accounts[0], "views", from, to, granularity, tz),
  ]);

  // A single-platform selection can show its industry band; a mixed one cannot,
  // because the bands differ and averaging them would be meaningless.
  const providers = new Set(accounts.map((a) => a.provider));
  const benchmark = providers.size === 1 ? (ER_BENCHMARKS[accounts[0].provider] ?? null) : null;

  // Alerts, goals and health all come from rows we already hold, so the
  // overview costs the same number of round trips it did before.
  const [alerts, goalRows] = await Promise.all([
    loadAlerts(accounts, now),
    prisma.socialGoal.findMany({
      where: { userId: auth.userId, status: "active" },
      orderBy: { dueAt: "asc" },
      take: 6,
    }),
  ]);

  const goals = await Promise.all(
    goalRows.map(async (goal) => {
      const scoped = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : accounts[0];
      const points = scoped
        ? (await loadSeries(scoped, goal.metric as MetricKey, from, to, "day", scoped.timezone ?? tz)).points
        : [];
      return {
        metric: goal.metric,
        label: `${METRIC_LABELS[goal.metric as MetricKey] ?? goal.metric}${
          goal.accountId ? "" : " · all accounts"
        }`,
        measurable: points.length > 0,
        ...goalProgress(
          {
            id: goal.id, metric: goal.metric, target: goal.target, baseline: goal.baseline,
            startAt: goal.startAt, dueAt: goal.dueAt, status: goal.status,
          },
          points,
          now,
        ),
      };
    }),
  );

  const health = perAccount.length === 1 ? perAccount[0] : null;

  // The executive summary panel. Its backend, its tests and its 402/409/502
  // handling all shipped; nothing ever mounted it, so /api/social/summary had
  // no caller and the tool was billable but unreachable. Price is read on the
  // server so the button can state it BEFORE the click.
  const [execReportCost, storedInsight] = await Promise.all([
    getToolConfig("social-exec-report").then((c) => c.creditCost),
    health
      ? prisma.aiInsight.findFirst({
          where: { accountId: health.account.id, kind: "executive_summary_weekly" },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);
  const storedSummary = (storedInsight?.content ?? null) as ExecutiveSummary | null;
  const storedSummaryAt = storedInsight?.createdAt.toISOString() ?? null;

  // One DOM node for the rail, never two. Below 2xl the column simply stacks
  // above the bands (alerts and the sync button are what you want first on a
  // phone); at 2xl it becomes the sticky rail. Rendering it twice behind
  // `hidden`/`2xl:hidden` would duplicate a landmark and every control in it
  // for anyone reading the accessibility tree.
  return (
    <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
      <aside
        aria-label="Actions and signals"
        className="flex w-full flex-col gap-4 2xl:order-2 2xl:max-h-[calc(100vh-6rem)] 2xl:w-[320px] 2xl:flex-shrink-0 2xl:sticky 2xl:top-4 2xl:overflow-y-auto 2xl:pb-4"
      >
        <QuickActions accountIds={accounts.map((a) => a.id)} />
        {/* Single-account only: an executive summary is written about ONE
            account's factsheet, and there is no sensible portfolio version. */}
        {health && (
          <AiInsightsPanel
            accountId={health.account.id}
            accountLabel={health.account.displayName ?? health.account.username ?? health.account.provider}
            cost={execReportCost}
            initialSummary={storedSummary}
            generatedAt={storedSummaryAt}
          />
        )}
        <AccountHealthPanel health={health} />
        <AlertStrip alerts={alerts} />
        <GoalsStrip goals={goals} />
      </aside>

      {/* A plain div, not <main>: DashboardShell already renders the page's
          <main>, and nesting a second one is invalid and announces a duplicate
          landmark. Admin's dashboard uses a div here for the same reason. */}
      <div className="min-w-0 flex-1 2xl:order-1">
        <Band ariaLabel="Headline performance" label="Performance">
          <div className={SPAN[12]}>
            <KpiHeroRow
              kpis={totals}
              sparklines={{ followers: followerSeries.points, views: viewsSeries.points }}
              benchmark={benchmark}
              // Only for a single account: the drivers behind a figure summed
              // across accounts differ per account, so one explanation would
              // describe none of them.
              explain={{ accountId: accounts.length === 1 ? accounts[0].id : null, range, tz }}
            />
          </div>
        </Band>

        <Band ariaLabel="Trends" label="Trends">
          <TrendSection
            followers={followerSeries.points}
            views={viewsSeries.points}
            rangeDays={range}
            granularity={granularity}
          />
        </Band>

        <Band ariaLabel="All metrics" label="All metrics">
          <div className={SPAN[12]}>
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
          </div>
        </Band>

        <Band ariaLabel="Connected accounts" label="Accounts">
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
        </Band>
      </div>
    </div>
  );
}

/**
 * Account health, in a card like everything else.
 *
 * It used to render bare — no container, no heading — between the trend charts
 * and the account cards, and only when exactly one account was in scope, so the
 * page's whole silhouette changed depending on the selection.
 *
 * Both ways it can be absent are now said out loud rather than by disappearing.
 * The null-score case matters most: healthScore is written by the nightly
 * `scores` job, which had never been scheduled in production, so this gauge was
 * being handed value={null} for every account that has ever existed.
 */
function AccountHealthPanel({ health }: { health: Awaited<ReturnType<typeof loadAccountKpis>> | null }) {
  if (!health) {
    return (
      <Panel title="Account health" dashed>
        <p className="py-2 text-xs text-fg-subtle">
          Pick a single account to see its health score — averaging it across accounts would
          describe none of them.
        </p>
      </Panel>
    );
  }

  if (health.account.healthScore === null) {
    return (
      <Panel title="Account health" dashed>
        <p className="py-2 text-xs text-fg-subtle">
          Scored nightly. This account hasn&rsquo;t been scored yet — it appears after the next run.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Account health">
      <Gauge
        label="Account health"
        value={health.account.healthScore}
        confidence={health.completeness}
        components={[
          { label: "Engagement", value: health.kpis.engagementRate.current },
          { label: "Growth", value: health.derived.weeklyGrowth },
          { label: "Data completeness", value: health.completeness * 100 },
        ]}
      />
    </Panel>
  );
}

/**
 * The current query string minus `account`, so picking one keeps the range and
 * granularity the user already chose rather than resetting them.
 */
function queryString(params: SearchParams): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "account") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) out.set(key, v);
  }
  return out.toString();
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

/**
 * Signals across the selection, newest-first, capped.
 *
 * Computed from stored rows rather than recorded at sync time so the rules can
 * change without a backfill — and so a milestone crossed while the cron was
 * down still shows up.
 */
async function loadAlerts(
  accounts: Awaited<ReturnType<typeof loadAccounts>>,
  now: Date,
): Promise<Array<AccountAlert & { accountLabel?: string }>> {
  const per = await Promise.all(
    accounts.map(async (account) => {
      const [snapshots, posts] = await Promise.all([
        prisma.socialAccountSnapshot.findMany({
          where: { accountId: account.id },
          orderBy: { capturedAt: "asc" },
          select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
        }),
        prisma.socialPost.findMany({
          where: { accountId: account.id },
          orderBy: { publishedAt: "desc" },
          take: 200,
          select: { id: true, publishedAt: true, views: true, reach: true, likes: true, comments: true, shares: true, saves: true },
        }),
      ]);
      const label = accounts.length > 1 ? (account.displayName ?? account.username ?? account.provider) : undefined;
      return computeAlerts(snapshots, posts, now).map((alert) => ({ ...alert, accountLabel: label }));
    }),
  );
  return per.flat().slice(0, 4);
}
