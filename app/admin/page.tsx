"use client";

// Executive analytics dashboard. Full-viewport 12-column grid plus a sticky
// rail, organised into bands that read money -> retention -> usage -> quality
// -> acquisition -> people -> platform.
//
// Rule inherited from the metrics engine: nothing is fabricated. A number we
// cannot derive renders as a labeled placeholder, and a CHART we cannot derive
// renders as a dashed shell with a skeleton axis and no curve — never an
// invented trend. Queues, workers and table sizes deliberately live on
// /admin/ops now; the rail carries only what needs a decision today.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  CreditCard, RefreshCcw, ShieldAlert, Ticket, TrendingUp, UserPlus, Users, Zap,
} from "lucide-react";
import AdminShell from "./AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import {
  PALETTE, ChartContainer, CountUp, DeltaChip, ErrorCard, HealthDot, Skeleton,
  compact, inr, pct, timeAgo,
} from "./dashboard/ui";
import {
  DivergingArea, Donut, Funnel, Gauge, HBars, Heatmap, Histogram, MultiLine,
  PlaceholderChart, RevenueAreaChart, SparkArea, StackedBars,
} from "./dashboard/charts";
import { DashboardHeader } from "./dashboard/DashboardHeader";

// ── Payload types (mirror lib/admin/metrics.ts) ──────────────────────────────
interface Spark { date: string; value: number }
interface Overview {
  mrrInPaise: number; arrInPaise: number; activeSubscribers: number;
  revenueTodayInPaise: number; revenueMtdInPaise: number; revenueGrowthPct: number | null;
  newUsers: number; dauProxy: number; conversionPct: number | null; churnProxyPct: number | null;
  arpuInPaise: number | null; refundRatePct: number | null; totalUsers: number;
  aiCostUsd: number; revenueRangeInPaise: number;
  sparklines: { revenue: Spark[]; signups: Spark[]; generations: Spark[]; creditsConsumed: Spark[] };
}
interface Revenue {
  series: Array<{ date: string; revenueInPaise: number; refundsInPaise: number; purchases: number }>;
  previousSeries: Array<{ date: string; revenueInPaise: number; refundsInPaise: number; purchases: number }> | null;
  signupSeries: Spark[];
  byPlan: Array<{ planName: string; revenueInPaise: number; purchases: number }>;
  sources: Array<{ name: string; inPaise: number; isCost?: boolean }>;
  aovInPaise: number | null;
  creditsSold: number; creditsConsumed: number;
  affiliate: Array<{ status: string; amount: number; count: number }>;
  /** Empty until the mrr-snapshot cron has recorded at least two days. */
  mrrSeries: Array<{ date: string; mrrInPaise: number; arrInPaise: number; activeSubscribers: number; source: string }>;
}
interface Ai {
  totalGenerations: number; successRatePct: number | null; failed: number;
  statusTotals: { completed: number; failed: number; cancelled: number; refunded: number; pending: number };
  trackedCost: { totalUsd: number; creditsCost: number; generations: number };
  costByProvider: Array<{ provider: string; costUsd: number; generations: number }>;
  topCostUsers: Array<{ userId: string; email: string; costUsd: number; creditsCost: number; generations: number }>;
  topModels: Array<{ modelId: string | null; generations: number; creditsCost: number; costUsd: number | null; errorRatePct: number | null }>;
}
interface Infra {
  db: boolean; redis: boolean;
  renderQueue: Record<string, number> | null;
  staleCronCount: number;
  process: { rssMb: number; heapUsedMb: number; uptimeHours: number };
}
type DayRow = { date: string } & Record<string, string | number>;
interface Lifecycle {
  series: DayRow[];
  churnVsReactivation: DayRow[];
  dunning: Array<{ name: string; value: number }>;
  totals: Record<string, number>;
  dataSince: string | null;
}
interface Credits {
  series: DayRow[];
  byBucket: Array<{ bucket: string; granted: number; spent: number }>;
  sinks: Array<{ label: string; value: number }>;
  sources: Array<{ label: string; value: number }>;
  netInRange: number;
}
interface Pipeline {
  generations: DayRow[];
  latency: DayRow[];
  heatmap: Array<{ day: number; hour: number; value: number }>;
  heatmapPeak: string | null;
  clips: DayRow[];
  virality: Array<{ label: string; count: number }>;
  renderTarget: Array<{ name: string; value: number }>;
}
interface Acquisition {
  dau: DayRow[];
  activation: Array<{ name: string; value: number }>;
  utmSources: string[];
  utm: DayRow[];
  email: DayRow[];
  webVitals: Array<{ metric: string; good: number; needsImprovement: number; poor: number; goodPct: number | null }>;
  storage: Array<{ date: string; gb: number }>;
  storageNowGb: number;
}
interface Top {
  topCreditUsers: Array<{ userId: string; label: string; credits: number; generations: number }>;
  topRevenueUsers: Array<{ userId: string; label: string; revenueInPaise: number; purchases: number }>;
  recentPurchases: Array<{ id: string; amountInPaise: number; status: string; createdAt: string; user: { id: string; email: string } | null; plan: { name: string } | null }>;
  countries: Array<{ label: string; count: number }>;
  devices: Array<{ label: string; count: number }>;
  loginDataSince: string | null;
}
interface Activity {
  events: Array<{ kind: string; at: string; title: string; href?: string }>;
}

// ── Lazy section hook ────────────────────────────────────────────────────────
function useSection<T>(section: string, range: number, refreshKey: number, opts?: { compare?: boolean; eager?: boolean }) {
  const { token } = useAuth();
  const [visible, setVisible] = useState(!!opts?.eager);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const eager = opts?.eager;
  const compare = opts?.compare;

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (ioRef.current) { ioRef.current.disconnect(); ioRef.current = null; }
      if (eager || !node) return;
      const io = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
        { rootMargin: "200px" },
      );
      io.observe(node);
      ioRef.current = io;
    },
    [eager],
  );

  useEffect(() => () => { ioRef.current?.disconnect(); }, []);

  const query = useQuery({
    queryKey: ["admin-dashboard", section, range, compare],
    queryFn: async () => {
      const params = new URLSearchParams({ section, range: String(range) });
      if (compare) params.set("compare", "1");
      const res = await fetch(`/api/admin/metrics?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load");
      const d = await res.json();
      return { value: d.data as T, env: (d.env as string | undefined) ?? null };
    },
    enabled: !!token && visible,
  });

  const latest = useRef({ visible, refetch: query.refetch });
  useEffect(() => {
    latest.current = { visible, refetch: query.refetch };
  });
  useEffect(() => {
    if (refreshKey > 0 && latest.current.visible) latest.current.refetch();
  }, [refreshKey]);

  return [
    { data: query.data?.value ?? null, env: query.data?.env ?? null, error: query.isError, retry: () => { query.refetch(); } },
    ref,
  ] as const;
}

// ── Layout atoms ─────────────────────────────────────────────────────────────
function Band({ children, ariaLabel, label }: { children: React.ReactNode; ariaLabel: string; label?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      aria-label={ariaLabel}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-4"
    >
      {label && (
        <div className="flex items-center gap-2.5 mb-2.5 mt-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle">{label}</span>
          <span className="flex-1 h-px bg-line" />
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">{children}</div>
    </motion.section>
  );
}

// Tailwind needs literal class strings, so spans are named rather than built.
const SPAN = {
  2: "col-span-6 sm:col-span-4 xl:col-span-2",
  3: "col-span-12 sm:col-span-6 xl:col-span-3",
  4: "col-span-12 lg:col-span-6 xl:col-span-4",
  5: "col-span-12 xl:col-span-5",
  6: "col-span-12 lg:col-span-6",
  8: "col-span-12 xl:col-span-8",
  12: "col-span-12",
} as const;

function Kpi({
  icon, label, value, format, delta, sub, spark, tooltip,
}: {
  icon?: React.ReactNode; label: string; value: number | null; format: (n: number) => string;
  delta?: number | null; sub?: string; spark?: Spark[]; tooltip?: string;
}) {
  return (
    <div className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm p-4 transition-shadow hover:shadow-md flex flex-col" title={tooltip}>
      <div className="flex items-center gap-1.5 text-fg-subtle mb-1.5">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="text-[11px] font-semibold">{label}</span>
        {delta !== undefined && <span className="ml-auto"><DeltaChip pct={delta} /></span>}
      </div>
      <p className="text-2xl font-extrabold text-fg leading-none tracking-tight">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {sub && <p className="text-[10px] text-fg-subtle mt-1.5">{sub}</p>}
      {spark && <div className="mt-auto pt-2.5"><SparkArea data={spark} /></div>}
    </div>
  );
}

function MiniKpi({ label, value, format, delta, sub }: {
  label: string; value: number | null; format: (n: number) => string; delta?: number | null; sub?: string;
}) {
  return (
    <div className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm px-4 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-subtle truncate">{label}</p>
      <p className="text-lg font-extrabold text-fg leading-tight mt-1">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {delta !== undefined ? <DeltaChip pct={delta} /> : sub ? <p className="text-[10px] text-fg-subtle">{sub}</p> : null}
    </div>
  );
}

function PlaceholderKpi({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-subtle truncate">{label}</p>
      <p className="text-lg font-extrabold text-fg-subtle leading-tight mt-1">—</p>
      <p className="text-[10px] text-fg-subtle">{needs}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [range, setRange] = useState<number>(30);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<"revenue" | "credits" | "cost" | "recent">("revenue");

  useEffect(() => {
    const r = Number(new URLSearchParams(window.location.search).get("range"));
    if ([7, 30, 90, 365].includes(r)) setRange(r);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => setRefreshKey((k) => k + 1), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  function manualRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  }
  function changeRange(r: number) {
    setRange(r);
    const url = new URL(window.location.href);
    url.searchParams.set("range", String(r));
    window.history.replaceState({}, "", url.toString());
  }

  const [overview, overviewRef] = useSection<Overview>("overview", range, refreshKey, { eager: true });
  const [infra] = useSection<Infra>("infra", range, refreshKey, { eager: true });
  const [revenue, revenueRef] = useSection<Revenue>("revenue", range, refreshKey, { compare: true });
  const [lifecycle, lifecycleRef] = useSection<Lifecycle>("lifecycle", range, refreshKey);
  const [credits, creditsRef] = useSection<Credits>("credits", range, refreshKey);
  const [ai, aiRef] = useSection<Ai>("ai", range, refreshKey);
  const [pipeline, pipelineRef] = useSection<Pipeline>("pipeline", range, refreshKey);
  const [acquisition, acquisitionRef] = useSection<Acquisition>("acquisition", range, refreshKey);
  const [top, topRef] = useSection<Top>("top", range, refreshKey);
  const [activity, activityRef] = useSection<Activity>("activity", range, refreshKey);

  const healthOk = infra.data ? infra.data.db && infra.data.redis : null;
  const alerts: Array<{ label: string; href: string }> = [];
  if (infra.data?.renderQueue?.failed) alerts.push({ label: `${infra.data.renderQueue.failed} failed render job(s)`, href: "/admin/ops" });
  if (infra.data && !healthOk) alerts.push({ label: "Core service degraded", href: "/admin/ops" });
  if (infra.data?.staleCronCount) alerts.push({ label: `${infra.data.staleCronCount} cron job(s) haven't run recently`, href: "/admin/ops" });
  if (lifecycle.data?.totals.payment_failed) alerts.push({ label: `${lifecycle.data.totals.payment_failed} payment failure(s) in range`, href: "/admin/subscriptions" });
  if (acquisition.data?.email.length) {
    const bounced = acquisition.data.email.reduce((s, r) => s + Number(r.bounced ?? 0), 0);
    if (bounced > 0) alerts.push({ label: `${bounced} bounced email(s)`, href: "/admin/ops" });
  }

  const o = overview.data;
  const rangeLabel = range === 365 ? "1y" : `${range}d`;

  const boards = {
    revenue: { label: "Top revenue", items: top.data?.topRevenueUsers.map((u) => ({ label: u.label, value: inr(u.revenueInPaise), sub: `${u.purchases} purchases`, href: `/admin/users/${u.userId}` })) ?? [] },
    credits: { label: "Top credits", items: top.data?.topCreditUsers.map((u) => ({ label: u.label, value: `${compact(u.credits)} cr`, sub: `${u.generations} generations`, href: `/admin/users/${u.userId}` })) ?? [] },
    cost: { label: "Highest AI cost", items: ai.data?.topCostUsers.map((u) => ({ label: u.email, value: `$${u.costUsd.toFixed(2)}`, sub: `${u.generations} generations`, href: `/admin/users/${u.userId}` })) ?? [] },
    recent: { label: "Recent purchases", items: top.data?.recentPurchases.map((p) => ({ label: p.user?.email ?? "?", value: inr(p.amountInPaise), sub: `${p.plan?.name ?? "credits"} · ${timeAgo(p.createdAt)}${p.status === "refunded" ? " · REFUNDED" : ""}`, href: p.user ? `/admin/users/${p.user.id}` : undefined })) ?? [] },
  } as const;

  return (
    <AdminShell title="Dashboard" wide>
      <DashboardHeader
        env={overview.env}
        range={range}
        onRange={changeRange}
        autoRefresh={autoRefresh}
        onAutoRefresh={setAutoRefresh}
        onRefresh={manualRefresh}
        refreshing={refreshing}
        healthOk={healthOk}
        alerts={alerts}
      />

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">

          {/* ── Hero KPIs ─────────────────────────────────────────────────── */}
          <Band ariaLabel="Headline metrics">
            <div ref={overviewRef} className="contents">
              {overview.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={overview.retry} /></div>
              ) : !o ? (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className={SPAN[3]}><Skeleton h="h-[132px]" /></div>)
              ) : (
                <>
                  {/* MRR is derived from CURRENT subscription state. There is no
                      historical snapshot, so it gets no sparkline and no delta —
                      a trend line here would be invented. */}
                  <div className={SPAN[3]}>
                    <div className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm p-4 h-full flex flex-col">
                      <div className="flex items-center gap-1.5 text-fg-subtle mb-1.5">
                        <TrendingUp size={13} aria-hidden />
                        <span className="text-[11px] font-semibold">Monthly recurring revenue</span>
                      </div>
                      <p className="text-2xl font-extrabold text-fg leading-none tracking-tight">
                        <CountUp value={o.mrrInPaise} format={inr} />
                      </p>
                      <p className="text-[10px] text-fg-subtle mt-1.5">ARR {inr(o.arrInPaise)}</p>
                      <span className="mt-auto pt-3 text-[9px] font-bold uppercase tracking-wider text-fg-subtle border border-dashed border-line-strong rounded-full px-2 py-0.5 self-start">
                        trend needs a snapshot table
                      </span>
                    </div>
                  </div>
                  <div className={SPAN[3]}>
                    <Kpi icon={<CreditCard size={13} />} label={`Revenue · ${rangeLabel}`} value={o.revenueRangeInPaise} format={inr}
                      delta={o.revenueGrowthPct} sub={`today ${inr(o.revenueTodayInPaise)} · MTD ${inr(o.revenueMtdInPaise)}`}
                      spark={o.sparklines.revenue} />
                  </div>
                  <div className={SPAN[3]}>
                    <Kpi icon={<Users size={13} />} label="Active paid subscribers" value={o.activeSubscribers} format={compact}
                      sub={`conversion ${pct(o.conversionPct)} · as of today, no prior snapshot`} />
                  </div>
                  <div className={SPAN[3]}>
                    {ai.data ? (
                      <ChartContainer title="Generation success" subtitle={`${compact(ai.data.totalGenerations)} in range`}>
                        <Gauge
                          successPct={ai.data.successRatePct}
                          chips={[
                            { label: "failed", value: ai.data.statusTotals.failed, tone: "bad" },
                            { label: "cancelled", value: ai.data.statusTotals.cancelled, tone: "warn" },
                            { label: "pending", value: ai.data.statusTotals.pending },
                          ]}
                        />
                      </ChartContainer>
                    ) : <Skeleton h="h-[132px]" />}
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── Revenue ───────────────────────────────────────────────────── */}
          <Band ariaLabel="Revenue" label="Revenue">
            <div ref={revenueRef} className="contents">
              {revenue.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={revenue.retry} /></div>
              ) : !revenue.data ? (
                <><div className={SPAN[8]}><Skeleton h="h-[360px]" /></div><div className={SPAN[4]}><Skeleton h="h-[360px]" /></div></>
              ) : (
                <>
                  <div className={SPAN[8]}>
                    <ChartContainer
                      title="Revenue vs refunds"
                      subtitle={`Daily captured purchases · last ${range} days. Drag the brush to zoom.`}
                      csv={{ filename: `revenue-${range}d.csv`, rows: revenue.data.series.map((s) => ({ date: s.date, revenueInPaise: s.revenueInPaise, refundsInPaise: s.refundsInPaise, purchases: s.purchases })) }}
                    >
                      <RevenueAreaChart data={revenue.data.series} previous={revenue.data.previousSeries} mrrInPaise={o?.mrrInPaise} />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Revenue sources" subtitle="Cost slices shown for context">
                      <Donut
                        slices={revenue.data.sources.map((s) => ({ name: s.name, value: s.inPaise, isCost: s.isCost }))}
                        centerLabel={`net · ${rangeLabel}`}
                        centerValue={inr(revenue.data.sources.filter((s) => !s.isCost).reduce((sum, s) => sum + s.inPaise, 0))}
                      />
                      <p className="text-[10px] text-fg-subtle mt-2">AOV {inr(revenue.data.aovInPaise)}</p>
                    </ChartContainer>
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── Secondary KPIs ────────────────────────────────────────────── */}
          <Band ariaLabel="Secondary metrics">
            {!o ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className={SPAN[2]}><Skeleton h="h-[76px]" /></div>)
            ) : (
              <>
                <div className={SPAN[2]}><MiniKpi label="Credits consumed" value={o.sparklines.creditsConsumed.reduce((s, p) => s + p.value, 0)} format={compact} sub="last 30 days" /></div>
                <div className={SPAN[2]}><MiniKpi label={`AI cost · ${rangeLabel}`} value={o.aiCostUsd} format={(n) => `$${n.toFixed(2)}`} sub="tracked tools only" /></div>
                <div className={SPAN[2]}><MiniKpi label={`ARPU · ${rangeLabel}`} value={o.arpuInPaise} format={inr} sub="per paying user" /></div>
                <div className={SPAN[2]}><MiniKpi label="Refund rate" value={o.refundRatePct} format={(n) => `${n.toFixed(1)}%`} sub="of all purchases" /></div>
                <div className={SPAN[2]}><MiniKpi label="Churn (proxy)" value={o.churnProxyPct} format={(n) => `${n.toFixed(1)}%`} sub="expiry-based proxy" /></div>
                <div className={SPAN[2]}><MiniKpi label={`New users · ${rangeLabel}`} value={o.newUsers} format={compact} sub={`${compact(o.totalUsers)} total`} /></div>
              </>
            )}
          </Band>

          {/* ── Subscription health ───────────────────────────────────────── */}
          <Band ariaLabel="Subscription health" label="Subscription health">
            <div ref={lifecycleRef} className="contents">
              {lifecycle.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={lifecycle.retry} /></div>
              ) : !lifecycle.data ? (
                <><div className={SPAN[5]}><Skeleton h="h-72" /></div><div className={SPAN[3]}><Skeleton h="h-72" /></div><div className={SPAN[4]}><Skeleton h="h-72" /></div></>
              ) : (
                <>
                  <div className={SPAN[5]}>
                    <ChartContainer title="Lifecycle events" subtitle="SubscriptionEvent by type, per day"
                      csv={{ filename: "lifecycle.csv", rows: lifecycle.data.series as unknown as Array<Record<string, string | number>> }}>
                      <StackedBars
                        data={lifecycle.data.series}
                        height={200}
                        series={[
                          { key: "activated", name: "Activated", color: PALETTE[1] },
                          { key: "payment_failed", name: "Payment failed", color: PALETTE[2] },
                          { key: "cancelled", name: "Cancelled", color: PALETTE[4] },
                          { key: "paused", name: "Paused", color: PALETTE[3] },
                        ]}
                      />
                      {lifecycle.data.dataSince && (
                        <p className="text-[10px] text-fg-subtle mt-2">
                          Recorded since {new Date(lifecycle.data.dataSince).toLocaleDateString("en-IN")} — earlier billing events weren’t stored.
                        </p>
                      )}
                    </ChartContainer>
                  </div>
                  <div className={SPAN[3]}>
                    <ChartContainer title="Dunning funnel" subtitle="Payment failure → recovery">
                      <Funnel steps={lifecycle.data.dunning.map((d, i) => ({ ...d, color: [PALETTE[2], PALETTE[0], PALETTE[3], PALETTE[4]][i] }))} />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Churn vs reactivation" subtitle="cancelled + paused vs resumed + activated">
                      <MultiLine
                        data={lifecycle.data.churnVsReactivation}
                        height={200}
                        series={[
                          { key: "churned", name: "Churned", color: PALETTE[4] },
                          { key: "reactivated", name: "Reactivated", color: PALETTE[1] },
                        ]}
                      />
                    </ChartContainer>
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── Credit economy ────────────────────────────────────────────── */}
          <Band ariaLabel="Credit economy" label="Credit economy">
            <div ref={creditsRef} className="contents">
              {credits.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={credits.retry} /></div>
              ) : !credits.data ? (
                <><div className={SPAN[8]}><Skeleton h="h-72" /></div><div className={SPAN[4]}><Skeleton h="h-72" /></div></>
              ) : (
                <>
                  <div className={SPAN[8]}>
                    <ChartContainer title="Credits granted vs spent" subtitle="CreditTransaction ledger, diverging around zero"
                      csv={{ filename: "credits.csv", rows: credits.data.series as unknown as Array<Record<string, string | number>> }}>
                      <DivergingArea
                        data={credits.data.series}
                        up={{ key: "granted", name: "Granted", color: PALETTE[1] }}
                        down={{ key: "spent", name: "Spent", color: PALETTE[3] }}
                      />
                      <p className="text-[11px] text-fg-muted mt-2">
                        Net {credits.data.netInRange >= 0 ? "+" : "−"}{compact(Math.abs(credits.data.netInRange))} credits this period
                      </p>
                    </ChartContainer>
                  </div>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Credit sink by tool" subtitle="Where spend actually goes">
                      <HBars items={credits.data.sinks} />
                    </ChartContainer>
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── Generation operations ─────────────────────────────────────── */}
          <Band ariaLabel="Generation operations" label="Generation operations">
            <div ref={pipelineRef} className="contents">
              {pipeline.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={pipeline.retry} /></div>
              ) : !pipeline.data ? (
                <><div className={SPAN[6]}><Skeleton h="h-72" /></div><div className={SPAN[3]}><Skeleton h="h-72" /></div><div className={SPAN[3]}><Skeleton h="h-72" /></div></>
              ) : (
                <>
                  <div className={SPAN[6]}>
                    <ChartContainer title="Generations by status" subtitle={`Per day · last ${range} days`}
                      csv={{ filename: "generations.csv", rows: pipeline.data.generations as unknown as Array<Record<string, string | number>> }}>
                      <StackedBars
                        data={pipeline.data.generations}
                        height={200}
                        series={[
                          { key: "completed", name: "Completed", color: PALETTE[1] },
                          { key: "failed", name: "Failed", color: PALETTE[4] },
                          { key: "cancelled", name: "Cancelled", color: PALETTE[3] },
                        ]}
                      />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[3]}>
                    <ChartContainer title="Latency" subtitle="completedAt − createdAt">
                      <MultiLine
                        data={pipeline.data.latency}
                        height={190}
                        valueFmt={(n) => `${Math.round(n)}s`}
                        yWidth={38}
                        series={[
                          { key: "p50", name: "p50", color: PALETTE[1] },
                          { key: "p95", name: "p95", color: PALETTE[2] },
                        ]}
                      />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[3]}>
                    {ai.data ? (
                      <ChartContainer title="Model mix" subtitle="Generations by model">
                        <HBars items={ai.data.topModels.slice(0, 6).map((m) => ({ label: m.modelId ?? "other", value: m.generations }))} />
                      </ChartContainer>
                    ) : <Skeleton h="h-72" />}
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── AutoClip quality ──────────────────────────────────────────── */}
          {pipeline.data && (
            <Band ariaLabel="AutoClip quality" label="AutoClip quality">
              <div className={SPAN[5]}>
                <ChartContainer title="Clips per day by status" subtitle="Clip.status">
                  <StackedBars
                    data={pipeline.data.clips}
                    height={190}
                    series={[
                      { key: "ready", name: "Ready", color: PALETTE[1] },
                      { key: "rendering", name: "Rendering", color: PALETTE[0] },
                      { key: "failed", name: "Failed", color: PALETTE[4] },
                    ]}
                  />
                </ChartContainer>
              </div>
              <div className={SPAN[4]}>
                <ChartContainer title="Virality score spread" subtitle="Clip.score, bucketed 0–99">
                  <Histogram buckets={pipeline.data.virality} height={190} />
                </ChartContainer>
              </div>
              <div className={SPAN[3]}>
                <ChartContainer title="Render target" subtitle="CPU vs GPU">
                  <Donut
                    slices={pipeline.data.renderTarget.map((r) => ({ name: r.name.toUpperCase(), value: r.value }))}
                    centerLabel="clips"
                    centerValue={compact(pipeline.data.renderTarget.reduce((s, r) => s + r.value, 0))}
                    valueFmt={compact}
                    height="h-40"
                  />
                </ChartContainer>
              </div>
            </Band>
          )}

          {/* ── Acquisition & messaging ───────────────────────────────────── */}
          <Band ariaLabel="Acquisition and messaging" label="Acquisition &amp; messaging">
            <div ref={acquisitionRef} className="contents">
              {acquisition.error ? (
                <div className={SPAN[12]}><ErrorCard onRetry={acquisition.retry} /></div>
              ) : !acquisition.data ? (
                <><div className={SPAN[4]}><Skeleton h="h-72" /></div><div className={SPAN[4]}><Skeleton h="h-72" /></div><div className={SPAN[4]}><Skeleton h="h-72" /></div></>
              ) : (
                <>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Activation funnel" subtitle={`Signups in the last ${range} days, followed through`}>
                      <Funnel steps={acquisition.data.activation.map((a, i) => ({ ...a, color: [PALETTE[0], PALETTE[1], PALETTE[1], PALETTE[2]][i] }))} />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Daily active users" subtitle="Distinct logins per day">
                      <MultiLine data={acquisition.data.dau} height={200} series={[{ key: "users", name: "DAU", color: PALETTE[1] }]} />
                    </ChartContainer>
                  </div>
                  <div className={SPAN[4]}>
                    <ChartContainer title="Email deliverability" subtitle="EmailLog status share, per day">
                      <StackedBars
                        data={acquisition.data.email}
                        height={200}
                        percent
                        series={[
                          { key: "delivered", name: "Delivered", color: PALETTE[1] },
                          { key: "bounced", name: "Bounced", color: PALETTE[2] },
                          { key: "complained", name: "Complaint", color: PALETTE[4] },
                          { key: "failed", name: "Failed", color: PALETTE[3] },
                        ]}
                      />
                    </ChartContainer>
                  </div>
                </>
              )}
            </div>
          </Band>

          {/* ── Accounts ──────────────────────────────────────────────────── */}
          <Band ariaLabel="Accounts" label="Accounts">
            <div ref={topRef} className="contents">
              <div className={SPAN[6]}>
                {!top.data ? <Skeleton h="h-80" /> : (
                  <ChartContainer title="Leaderboards" subtitle={`Top accounts · ${rangeLabel}`}>
                    <div className="flex gap-0.5 border-b border-line mb-3 -mt-1">
                      {(Object.keys(boards) as Array<keyof typeof boards>).map((k) => (
                        <button key={k} onClick={() => setBoard(k)} aria-pressed={board === k}
                          className={`text-xs font-semibold px-3 py-2 -mb-px border-b-2 cursor-pointer transition-colors ${board === k ? "border-emerald-bright text-fg" : "border-transparent text-fg-subtle hover:text-fg-muted"}`}>
                          {boards[k].label}
                        </button>
                      ))}
                    </div>
                    {boards[board].items.length === 0 ? (
                      <p className="text-xs text-fg-subtle py-4">No data in range.</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {boards[board].items.map((i, idx) => (
                          <li key={`${i.label}-${idx}`}>
                            <a href={i.href ?? "#"} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-surface-2">
                              <span className="w-6 h-6 rounded-full bg-surface-2 text-[10px] font-bold text-fg-subtle flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                              <span className="w-7 h-7 rounded-full bg-tint-emerald border border-tint-emerald-border text-emerald-bright text-[11px] font-bold flex items-center justify-center flex-shrink-0 uppercase">{i.label.slice(0, 1)}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-semibold text-fg truncate">{i.label}</span>
                                <span className="block text-[10px] text-fg-subtle truncate">{i.sub}</span>
                              </span>
                              <span className="text-xs font-bold text-fg flex-shrink-0">{i.value}</span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    )}
                  </ChartContainer>
                )}
              </div>
              <div className={SPAN[6]}>
                {!pipeline.data ? <Skeleton h="h-80" /> : (
                  <ChartContainer title="Activity heatmap" subtitle="Generations by hour and weekday (IST)">
                    <Heatmap cells={pipeline.data.heatmap} peakLabel={pipeline.data.heatmapPeak} />
                  </ChartContainer>
                )}
              </div>
            </div>
          </Band>

          {/* ── Platform ──────────────────────────────────────────────────── */}
          <Band ariaLabel="Platform" label="Platform">
            {acquisition.data ? (
              <>
                <div className={SPAN[4]}>
                  <ChartContainer title="Storage growth" subtitle="Cumulative asset bytes">
                    <MultiLine data={acquisition.data.storage as unknown as DayRow[]} height={170}
                      valueFmt={(n) => `${n.toFixed(0)}G`} yWidth={40}
                      series={[{ key: "gb", name: "Stored (GB)" }]} />
                    <p className="text-[11px] text-fg-muted mt-2">Now {acquisition.data.storageNowGb.toFixed(1)} GB</p>
                  </ChartContainer>
                </div>
                <div className={SPAN[4]}>
                  <ChartContainer title="Web vitals" subtitle="Share of good samples">
                    {acquisition.data.webVitals.length === 0 ? (
                      <p className="text-xs text-fg-subtle py-6 text-center">No samples collected yet.</p>
                    ) : acquisition.data.webVitals.map((v) => {
                      const total = v.good + v.needsImprovement + v.poor || 1;
                      return (
                        <div key={v.metric} className="mb-3 last:mb-0">
                          <div className="flex justify-between text-[11.5px] mb-1">
                            <span className="font-semibold text-fg-muted">{v.metric}</span>
                            <span className="text-fg-subtle">{v.goodPct === null ? "—" : `${v.goodPct.toFixed(0)}% good`}</span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                            <div style={{ width: `${(v.good / total) * 100}%`, background: PALETTE[1] }} />
                            <div style={{ width: `${(v.needsImprovement / total) * 100}%`, background: PALETTE[2] }} />
                            <div style={{ width: `${(v.poor / total) * 100}%`, background: PALETTE[4] }} />
                          </div>
                        </div>
                      );
                    })}
                  </ChartContainer>
                </div>
                {/* Flips from placeholder to real chart on its own, once the
                    mrr-snapshot cron has recorded two days. */}
                <div className={SPAN[4]}>
                  {(revenue.data?.mrrSeries.length ?? 0) >= 2 ? (
                    <ChartContainer title="MRR over time" subtitle="Recorded daily since the snapshot cron went live"
                      csv={{ filename: "mrr-history.csv", rows: revenue.data!.mrrSeries.map((m) => ({ date: m.date, mrrInPaise: m.mrrInPaise, activeSubscribers: m.activeSubscribers })) }}>
                      <MultiLine
                        data={revenue.data!.mrrSeries as unknown as DayRow[]}
                        height={170}
                        valueFmt={(n) => `₹${compact(n / 100)}`}
                        yWidth={48}
                        series={[{ key: "mrrInPaise", name: "MRR" }]}
                      />
                    </ChartContainer>
                  ) : (
                    <ChartContainer title="MRR over time" subtitle="recording has just started" dashed>
                      <PlaceholderChart
                        height={140}
                        needs="MRR is derived from current subscription state, so there is nothing to plot backwards. The mrr-snapshot cron now records it daily — this chart fills itself in once two days exist, and is deliberately not backfilled because past plan assignments aren't stored."
                      />
                    </ChartContainer>
                  )}
                </div>
              </>
            ) : (
              <><div className={SPAN[4]}><Skeleton h="h-64" /></div><div className={SPAN[4]}><Skeleton h="h-64" /></div><div className={SPAN[4]}><Skeleton h="h-64" /></div></>
            )}
          </Band>

          {/* ── AI cost ───────────────────────────────────────────────────── */}
          <Band ariaLabel="AI cost" label="AI cost">
            <div ref={aiRef} className="contents">
              {!ai.data ? (
                <><div className={SPAN[6]}><Skeleton h="h-64" /></div><div className={SPAN[6]}><Skeleton h="h-64" /></div></>
              ) : (
                <>
                  <div className={SPAN[6]}>
                    <ChartContainer title="AI cost by provider" subtitle={`$${ai.data.trackedCost.totalUsd.toFixed(2)} tracked spend · ${rangeLabel}`}
                      csv={{ filename: "cost-by-provider.csv", rows: ai.data.costByProvider.map((c) => ({ provider: c.provider, costUsd: c.costUsd.toFixed(4), generations: c.generations })) }}>
                      <HBars items={ai.data.costByProvider.map((c) => ({ label: c.provider, value: Number(c.costUsd.toFixed(2)) }))} valueFmt={(n) => `$${n}`} />
                      <p className="text-[10px] text-fg-subtle mt-2">
                        Avg ${ai.data.trackedCost.generations > 0 ? (ai.data.trackedCost.totalUsd / ai.data.trackedCost.generations).toFixed(3) : "—"}/generation ·
                        {" "}{compact(ai.data.trackedCost.creditsCost)} credits burned
                      </p>
                    </ChartContainer>
                  </div>
                  <div className={SPAN[6]}>
                    <ChartContainer title="Cost by model" subtitle="Tracked generations only">
                      <HBars items={ai.data.topModels.filter((m) => m.costUsd != null).map((m) => ({ label: m.modelId ?? "other", value: Number((m.costUsd ?? 0).toFixed(2)) }))} valueFmt={(n) => `$${n}`} />
                    </ChartContainer>
                  </div>
                </>
              )}
            </div>
          </Band>
        </div>

        {/* ── Right rail ────────────────────────────────────────────────────── */}
        <aside
          aria-label="Alerts and activity"
          className="hidden 2xl:flex w-[320px] flex-shrink-0 flex-col gap-4 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pb-4"
        >
          {alerts.length > 0 && (
            <div className="bg-tint-rose border border-tint-rose-border rounded-[var(--radius-card)] p-4">
              <div className="flex items-center mb-2.5">
                <h2 className="text-xs font-bold text-fg">Needs attention</h2>
                <span className="ml-auto text-[10px] font-bold text-error">{alerts.length}</span>
              </div>
              <ul className="space-y-1.5">
                {alerts.map((a) => (
                  <li key={a.label}>
                    <a href={a.href} className="flex gap-2 text-[11.5px] text-fg-muted hover:text-fg leading-snug">
                      <span className="w-1.5 h-1.5 rounded-full bg-error mt-1.5 flex-shrink-0" aria-hidden />
                      {a.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-panel border border-line rounded-[var(--radius-card)] p-4 shadow-sm">
            <div className="flex items-center mb-2.5">
              <h2 className="text-xs font-bold text-fg">Service health</h2>
            </div>
            {infra.data ? (
              <div className="space-y-2">
                <HealthDot ok={infra.data.db} label={`Postgres ${infra.data.db ? "reachable" : "DOWN"}`} />
                <HealthDot ok={infra.data.redis} label={`Redis ${infra.data.redis ? "reachable" : "DOWN"}`} />
                <HealthDot ok={(infra.data.renderQueue?.failed ?? 0) === 0} label={`Render queue ${infra.data.renderQueue ? `${infra.data.renderQueue.failed ?? 0} failed` : "unavailable"}`} />
                <a href="/admin/ops" className="inline-block text-[11px] font-semibold text-emerald-bright pt-1">Open Operations →</a>
              </div>
            ) : <Skeleton h="h-24" />}
          </div>

          <div ref={activityRef} className="bg-panel border border-line rounded-[var(--radius-card)] p-4 shadow-sm">
            <div className="flex items-center mb-2.5">
              <h2 className="text-xs font-bold text-fg">Live activity</h2>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-fg-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden />live
              </span>
            </div>
            {activity.error ? (
              <ErrorCard onRetry={activity.retry} />
            ) : !activity.data ? (
              <Skeleton h="h-64" />
            ) : activity.data.events.length === 0 ? (
              <p className="text-xs text-fg-subtle py-3">No recent activity.</p>
            ) : (
              <ol className="space-y-0.5 max-h-[420px] overflow-y-auto -mr-1 pr-1">
                {activity.data.events.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <a href={e.href ?? "#"} className="flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-surface-2">
                      <ActivityIcon kind={e.kind} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] text-fg-muted leading-snug">{e.title}</span>
                        <span className="block text-[10px] text-fg-subtle mt-0.5">{timeAgo(e.at)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-4">
            <h2 className="text-xs font-bold text-fg-muted">Instrumentation gaps</h2>
            <p className="text-[10.5px] text-fg-subtle leading-relaxed mt-1 mb-2">
              Designed in, deliberately empty — no source table backs these yet.
            </p>
            <div className="space-y-0">
              {[
                { name: "MRR over time", needs: "an MrrSnapshot table plus a nightly cron" },
                { name: "Cohort retention", needs: "per-day activity events, not just lifetime flags" },
                { name: "CAC", needs: "a marketing-spend source — none exists" },
                { name: "LTV", needs: "CAC plus churn history to project against" },
              ].map((g) => (
                <div key={g.name} className="py-2 border-t border-dashed border-line first:border-t-0">
                  <p className="text-[11.5px] font-semibold text-fg-muted">{g.name}</p>
                  <p className="text-[10px] text-fg-subtle leading-snug mt-0.5">{g.needs}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}

function ActivityIcon({ kind }: { kind: string }) {
  // Every tint here used to be a stock light-mode Tailwind shade (emerald-50,
  // amber-50, violet-50) sitting on a near-black panel, plus text-brand, which
  // resolves to lime in the emerald theme.
  const cls = "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5";
  switch (kind) {
    case "user": return <span className={`${cls} bg-tint-emerald text-emerald-bright`}><UserPlus size={12} /></span>;
    case "purchase": return <span className={`${cls} bg-success/10 text-success`}><CreditCard size={12} /></span>;
    case "refund": return <span className={`${cls} bg-error/10 text-error`}><RefreshCcw size={12} /></span>;
    case "generation_failed": return <span className={`${cls} bg-warning/10 text-warning`}><Zap size={12} /></span>;
    case "coupon": return <span className={`${cls} bg-tint-violet text-info`}><Ticket size={12} /></span>;
    default: return <span className={`${cls} bg-surface-2 text-fg-muted`}><ShieldAlert size={12} /></span>;
  }
}
