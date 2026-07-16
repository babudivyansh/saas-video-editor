"use client";

// Executive analytics dashboard. Single dense page, ten rows; every row lazily
// fetches exactly one /api/admin/metrics section when scrolled into view.
// Rule inherited from the metrics engine: nothing is fabricated — metrics we
// can't derive render as labeled placeholders or are omitted with a note.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Coins, CreditCard, RefreshCcw, ShieldAlert, Ticket, TrendingUp, UserPlus, Users, Zap,
} from "lucide-react";
import AdminShell from "./AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import {
  ChartContainer, CountUp, DeltaChip, ErrorCard, HealthDot, Leaderboard, Skeleton,
  compact, inr, pct, timeAgo,
} from "./dashboard/ui";
import { Donut, Gauge, GrowthLineChart, HBars, RevenueAreaChart, SparkArea } from "./dashboard/charts";
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
}
interface Ai {
  totalGenerations: number; successRatePct: number | null; failed: number;
  statusTotals: { completed: number; failed: number; cancelled: number; refunded: number; pending: number };
  avgLatencyByTool: Array<{ toolSlug: string; avgSeconds: number | null; count: number }>;
  trackedCost: { totalUsd: number; creditsCost: number; generations: number };
  costByProvider: Array<{ provider: string; costUsd: number; generations: number }>;
  topCostUsers: Array<{ userId: string; email: string; costUsd: number; creditsCost: number; generations: number }>;
  topModels: Array<{ modelId: string | null; generations: number; creditsCost: number; costUsd: number | null; errorRatePct: number | null }>;
  byTool: Array<{ toolSlug: string; generations: number }>;
}
interface Social {
  accounts: Array<{ provider: string; status: string; _count: number }>;
  connectedTotal: number; needsReauth: number; followersTracked: number;
  postsSynced: number; syncsToday: { ok: number; fail: number }; staleOver24h: number;
}
interface Infra {
  db: boolean; redis: boolean;
  renderQueue: Record<string, number> | null;
  process: { rssMb: number; heapUsedMb: number; uptimeHours: number };
}
interface Growth {
  coupons: { top: Array<{ code: string; timesRedeemed: number }>; totalDiscountInPaise: number };
  affiliates: { count: number; referrals: Record<string, number>; conversionPct: number | null };
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
interface Ops {
  heartbeats: Record<string, string | null>;
  failedJobs: Array<{ id: string }>;
  tableSizes: Array<{ table: string; size: string }>;
}

// ── Lazy section hook ────────────────────────────────────────────────────────
function useSection<T>(section: string, range: number, refreshKey: number, opts?: { compare?: boolean; eager?: boolean }) {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [env, setEnv] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(!!opts?.eager);
  const ref = useRef<HTMLDivElement>(null);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (opts?.eager || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: "200px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [opts?.eager]);

  const load = useCallback(async () => {
    if (!token) return;
    setError(false);
    try {
      const params = new URLSearchParams({ section, range: String(range) });
      if (opts?.compare) params.set("compare", "1");
      const res = await fetch(`/api/admin/metrics?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d.data as T);
      setEnv(d.env ?? null);
      loadedOnce.current = true;
    } catch {
      setError(true);
    }
  }, [token, section, range, opts?.compare]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  // Auto/manual refresh only refetches sections that already loaded.
  useEffect(() => {
    if (refreshKey > 0 && loadedOnce.current) load();
  }, [refreshKey, load]);

  return { data, env, error, retry: load, ref };
}

function Row({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      aria-label={ariaLabel}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-5"
    >
      {children}
    </motion.section>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({
  icon, label, value, format, delta, sub, spark, tooltip,
}: {
  icon: React.ReactNode; label: string; value: number | null; format: (n: number) => string;
  delta?: number | null; sub?: string; spark?: Spark[]; tooltip?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 transition-shadow hover:shadow-md" title={tooltip}>
      <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
        <span aria-hidden>{icon}</span>
        <span className="text-[11px] font-semibold">{label}</span>
        {delta !== undefined && <span className="ml-auto"><DeltaChip pct={delta} /></span>}
      </div>
      <p className="text-xl font-extrabold text-gray-900 leading-none">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
      {spark && <div className="mt-2 -mb-1"><SparkArea data={spark} /></div>}
    </div>
  );
}

function PlaceholderKpi({ label }: { label: string }) {
  return (
    <div className="bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 p-4">
      <p className="text-[11px] font-semibold text-gray-400 mb-1.5">{label}</p>
      <p className="text-xl font-extrabold text-gray-300 leading-none">—</p>
      <p className="text-[10px] text-gray-400 mt-1">needs instrumentation</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [range, setRange] = useState<number>(30);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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

  const overview = useSection<Overview>("overview", range, refreshKey, { eager: true });
  const infra = useSection<Infra>("infra", range, refreshKey, { eager: true });
  const revenue = useSection<Revenue>("revenue", range, refreshKey, { compare: true });
  const ai = useSection<Ai>("ai", range, refreshKey);
  const social = useSection<Social>("social", range, refreshKey);
  const growth = useSection<Growth>("growth", range, refreshKey);
  const top = useSection<Top>("top", range, refreshKey);
  const activity = useSection<Activity>("activity", range, refreshKey);
  const ops = useOps(refreshKey);

  const healthOk = infra.data ? infra.data.db && infra.data.redis : null;
  const alerts: Array<{ label: string; href: string }> = [];
  if (infra.data?.renderQueue?.failed) alerts.push({ label: `${infra.data.renderQueue.failed} failed render job(s)`, href: "/admin/ops" });
  if (social.data?.needsReauth) alerts.push({ label: `${social.data.needsReauth} social account(s) need re-auth`, href: "/admin/analytics" });
  if (social.data && social.data.syncsToday.fail > 0) alerts.push({ label: `${social.data.syncsToday.fail} sync failure(s) today`, href: "/admin/ops" });
  if (infra.data && !healthOk) alerts.push({ label: "Core service degraded", href: "/admin/ops" });

  const o = overview.data;

  return (
    <AdminShell title="Dashboard">
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

      {/* Row 1 — Executive KPIs */}
      <Row ariaLabel="Executive KPIs">
        <div ref={overview.ref}>
          {overview.error ? (
            <ErrorCard onRetry={overview.retry} />
          ) : !o ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              <Kpi icon={<TrendingUp size={13} />} label="MRR" value={o.mrrInPaise} format={inr} sub={`ARR ${inr(o.arrInPaise)}`} spark={o.sparklines.revenue} tooltip="Active subscribers × plan price normalized to one month" />
              <Kpi icon={<CreditCard size={13} />} label="Revenue today" value={o.revenueTodayInPaise} format={inr} sub={`MTD ${inr(o.revenueMtdInPaise)}`} delta={o.revenueGrowthPct} tooltip="Month-to-date vs previous month" />
              <Kpi icon={<Users size={13} />} label="Active logins (24h)" value={o.dauProxy} format={compact} sub="login-based proxy" spark={o.sparklines.signups} />
              <Kpi icon={<UserPlus size={13} />} label={`New users (${range}d)`} value={o.newUsers} format={compact} sub={`${compact(o.totalUsers)} total`} spark={o.sparklines.signups} />
              <Kpi icon={<Users size={13} />} label="Paid subscribers" value={o.activeSubscribers} format={compact} sub={`conversion ${pct(o.conversionPct)}`} />
              <Kpi icon={<RefreshCcw size={13} />} label="Churn (30d proxy)" value={o.churnProxyPct} format={(n) => `${n.toFixed(1)}%`} sub="expiries / (expiries+active)" />
              <Kpi icon={<Coins size={13} />} label="Credits consumed" value={o.sparklines.creditsConsumed.reduce((s, p) => s + p.value, 0)} format={compact} sub="last 30 days" spark={o.sparklines.creditsConsumed} />
              <Kpi icon={<Zap size={13} />} label={`AI cost (${range}d)`} value={o.aiCostUsd} format={(n) => `$${n.toFixed(2)}`} sub={`vs ${inr(o.revenueRangeInPaise)} revenue — FX-separate proxy`} spark={o.sparklines.generations} />
              <Kpi icon={<CreditCard size={13} />} label={`ARPU (${range}d)`} value={o.arpuInPaise} format={inr} />
              <Kpi icon={<ShieldAlert size={13} />} label="Refund rate" value={o.refundRatePct} format={(n) => `${n.toFixed(1)}%`} sub="of all purchases" />
              <PlaceholderKpi label="CAC" />
              <PlaceholderKpi label="LTV" />
            </div>
          )}
        </div>
      </Row>

      {/* Row 2 — Revenue analytics */}
      <Row ariaLabel="Revenue analytics">
        <div ref={revenue.ref}>
          {revenue.error ? (
            <ErrorCard onRetry={revenue.retry} />
          ) : !revenue.data ? (
            <Skeleton h="h-80" />
          ) : (
            <ChartContainer
              title={`Revenue — last ${range} days`}
              subtitle="Daily captured revenue vs refunds, with previous-period overlay. Drag the brush to zoom."
              csv={{ filename: `revenue-${range}d.csv`, rows: revenue.data.series.map((s) => ({ date: s.date, revenueInPaise: s.revenueInPaise, refundsInPaise: s.refundsInPaise, purchases: s.purchases })) }}
            >
              <RevenueAreaChart data={revenue.data.series} previous={revenue.data.previousSeries} mrrInPaise={o?.mrrInPaise} />
            </ChartContainer>
          )}
        </div>
      </Row>

      {/* Row 3 — Growth + revenue sources */}
      <Row ariaLabel="User growth and revenue sources">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {revenue.data ? (
            <>
              <ChartContainer title="User growth" subtitle={`Signups — last ${range} days`}
                csv={{ filename: "signups.csv", rows: revenue.data.signupSeries.map((s) => ({ date: s.date, signups: s.value })) }}>
                <GrowthLineChart daily={revenue.data.signupSeries} />
              </ChartContainer>
              <ChartContainer title="Revenue sources" subtitle="Cost slices (affiliate payouts, coupon discounts) shown for context. Enterprise: no such plan kind.">
                <Donut
                  slices={revenue.data.sources.map((s) => ({ name: s.name, value: s.inPaise, isCost: s.isCost }))}
                  centerLabel="net-ish view"
                  centerValue={inr(revenue.data.sources.filter((s) => !s.isCost).reduce((sum, s) => sum + s.inPaise, 0))}
                />
              </ChartContainer>
            </>
          ) : (
            <>
              <Skeleton h="h-72" />
              <Skeleton h="h-72" />
            </>
          )}
        </div>
      </Row>

      {/* Row 4 — AI usage, success gauge, infra health */}
      <Row ariaLabel="AI usage and infrastructure health">
        <div ref={ai.ref} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {ai.error ? (
            <div className="lg:col-span-3"><ErrorCard onRetry={ai.retry} /></div>
          ) : !ai.data ? (
            <>
              <Skeleton h="h-72" /><Skeleton h="h-72" /><Skeleton h="h-72" />
            </>
          ) : (
            <>
              <ChartContainer title="AI model usage" subtitle={`Generations per model — last ${range} days`}
                csv={{ filename: "models.csv", rows: ai.data.topModels.map((m) => ({ model: m.modelId ?? "-", generations: m.generations, credits: m.creditsCost, costUsd: m.costUsd, errorPct: m.errorRatePct })) }}>
                <HBars items={ai.data.topModels.map((m) => ({ label: m.modelId ?? "other", value: m.generations }))} />
                {ai.data.topModels.some((m) => (m.errorRatePct ?? 0) > 10) && (
                  <p className="text-[10px] text-red-600 mt-2">⚠ Some models exceed 10% error rate — details on the AI tab of Analytics.</p>
                )}
              </ChartContainer>
              <ChartContainer title="Generation success" subtitle={`${compact(ai.data.totalGenerations)} generations in range`}>
                <Gauge
                  successPct={ai.data.successRatePct}
                  chips={[
                    { label: "failed", value: ai.data.statusTotals.failed, tone: "bad" },
                    { label: "cancelled", value: ai.data.statusTotals.cancelled, tone: "warn" },
                    { label: "pending", value: ai.data.statusTotals.pending },
                    { label: "refunded", value: ai.data.statusTotals.refunded, tone: "warn" },
                  ]}
                />
              </ChartContainer>
              <ChartContainer title="Infrastructure" subtitle="Live status — 30s cache">
                {infra.data ? (
                  <div className="space-y-2.5">
                    <HealthDot ok={infra.data.db} label={`Postgres ${infra.data.db ? "reachable" : "DOWN"}`} />
                    <HealthDot ok={infra.data.redis} label={`Redis ${infra.data.redis ? "reachable" : "DOWN / write-locked"}`} />
                    <HealthDot ok={(infra.data.renderQueue?.failed ?? 0) === 0} label={`Render queue: ${infra.data.renderQueue ? `${infra.data.renderQueue.failed ?? 0} failed / ${infra.data.renderQueue.active ?? 0} active` : "not available"}`} />
                    <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-gray-50">
                      <div><p className="text-sm font-bold text-gray-900">{infra.data.process.rssMb}</p><p className="text-[10px] text-gray-400">RSS MB</p></div>
                      <div><p className="text-sm font-bold text-gray-900">{infra.data.process.heapUsedMb}</p><p className="text-[10px] text-gray-400">Heap MB</p></div>
                      <div><p className="text-sm font-bold text-gray-900">{infra.data.process.uptimeHours}</p><p className="text-[10px] text-gray-400">Uptime h</p></div>
                    </div>
                    <p className="text-[10px] text-gray-400">Host CPU/disk needs an infra agent.</p>
                  </div>
                ) : (
                  <Skeleton h="h-40" />
                )}
              </ChartContainer>
            </>
          )}
        </div>
      </Row>

      {/* Row 5 — Social tracker */}
      <Row ariaLabel="Social tracker">
        <div ref={social.ref}>
          {social.error ? (
            <ErrorCard onRetry={social.retry} />
          ) : !social.data ? (
            <Skeleton h="h-56" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi icon={<Users size={13} />} label="Connected accounts" value={social.data.connectedTotal} format={compact} />
              <Kpi icon={<TrendingUp size={13} />} label="Followers tracked" value={social.data.followersTracked} format={compact} />
              <Kpi icon={<Zap size={13} />} label="Posts synced" value={social.data.postsSynced} format={compact} />
              <Kpi icon={<RefreshCcw size={13} />} label="Syncs today" value={social.data.syncsToday.ok} format={compact} sub={`${social.data.syncsToday.fail} failed`} />
              <Kpi icon={<ShieldAlert size={13} />} label="Need re-auth" value={social.data.needsReauth} format={compact} sub={social.data.needsReauth > 0 ? "action needed" : "all healthy"} />
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[11px] font-semibold text-gray-400 mb-2">Platform share</p>
                {(() => {
                  const byProvider = new Map<string, number>();
                  for (const r of social.data!.accounts) byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + r._count);
                  const total = [...byProvider.values()].reduce((s, v) => s + v, 0) || 1;
                  return (
                    <div className="space-y-1">
                      {[...byProvider.entries()].map(([p, count], i) => (
                        <div key={p} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-2 h-2 rounded-full" style={{ background: ["#2563eb", "#0d9488", "#d97706", "#7c3aed"][i % 4] }} aria-hidden />
                          <span className="text-gray-500 capitalize flex-1">{p}</span>
                          <span className="font-semibold text-gray-700">{Math.round((count / total) * 100)}%</span>
                        </div>
                      ))}
                      {byProvider.size === 0 && <p className="text-[10px] text-gray-400">No accounts yet.</p>}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </Row>

      {/* Row 6 — Financial analytics */}
      <Row ariaLabel="Financial analytics">
        <div ref={growth.ref} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {revenue.data && growth.data ? (
            <>
              <ChartContainer title="Credits: sold vs consumed" subtitle={`Last ${range} days`}>
                <HBars
                  items={[
                    { label: "Sold", value: revenue.data.creditsSold },
                    { label: "Consumed", value: revenue.data.creditsConsumed },
                  ]}
                />
                <p className="text-[11px] text-gray-500 mt-2">AOV {inr(revenue.data.aovInPaise)} · ARPU {inr(o?.arpuInPaise ?? null)} · LTV needs cohort tracking</p>
              </ChartContainer>
              <ChartContainer title="Affiliate commissions" subtitle="All time, by status">
                <HBars items={revenue.data.affiliate.map((a) => ({ label: a.status, value: Math.round(a.amount) }))} valueFmt={(n) => `₹${compact(n)}`} />
                {(() => {
                  const pending = revenue.data!.affiliate.find((a) => a.status === "available");
                  return pending && pending.amount >= 500
                    ? <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1 mt-2">₹{pending.amount.toFixed(0)} awaiting payout</p>
                    : null;
                })()}
              </ChartContainer>
              <ChartContainer title="Coupon usage" subtitle={`₹${compact(growth.data.coupons.totalDiscountInPaise / 100)} total discount given`}>
                <HBars items={growth.data.coupons.top.slice(0, 6).map((c) => ({ label: c.code, value: c.timesRedeemed }))} />
              </ChartContainer>
            </>
          ) : (
            <>
              <Skeleton h="h-64" /><Skeleton h="h-64" /><Skeleton h="h-64" />
            </>
          )}
        </div>
      </Row>

      {/* Row 7 — AI cost */}
      <Row ariaLabel="AI cost">
        {ai.data ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartContainer title="AI cost by provider" subtitle={`$${ai.data.trackedCost.totalUsd.toFixed(2)} tracked provider spend (${range}d)`}
              csv={{ filename: "cost-by-provider.csv", rows: ai.data.costByProvider.map((c) => ({ provider: c.provider, costUsd: c.costUsd.toFixed(4), generations: c.generations })) }}>
              <HBars items={ai.data.costByProvider.map((c) => ({ label: c.provider, value: Number(c.costUsd.toFixed(2)) }))} valueFmt={(n) => `$${n}`} />
              <p className="text-[10px] text-gray-400 mt-2">
                Avg ${ai.data.trackedCost.generations > 0 ? (ai.data.trackedCost.totalUsd / ai.data.trackedCost.generations).toFixed(3) : "—"}/generation ·
                {" "}{compact(ai.data.trackedCost.creditsCost)} credits burned
              </p>
            </ChartContainer>
            <ChartContainer title="Cost by model" subtitle="Tracked generations only">
              <HBars items={ai.data.topModels.filter((m) => m.costUsd != null).map((m) => ({ label: m.modelId ?? "other", value: Number((m.costUsd ?? 0).toFixed(2)) }))} valueFmt={(n) => `$${n}`} />
            </ChartContainer>
            <Leaderboard
              title="Highest-cost users"
              items={ai.data.topCostUsers.map((u) => ({
                label: u.email, value: `$${u.costUsd.toFixed(2)}`, sub: `${u.generations} generations · ${compact(u.creditsCost)} cr`, href: `/admin/users/${u.userId}`,
              }))}
              csvName="top-cost-users.csv"
            />
          </div>
        ) : (
          <Skeleton h="h-64" />
        )}
      </Row>

      {/* Row 8 — Top lists */}
      <Row ariaLabel="Top lists">
        <div ref={top.ref}>
          {top.error ? (
            <ErrorCard onRetry={top.retry} />
          ) : !top.data ? (
            <Skeleton h="h-64" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              <Leaderboard title={`Top credit users (${range}d)`} csvName="top-credit-users.csv"
                items={top.data.topCreditUsers.map((u) => ({ label: u.label, value: `${compact(u.credits)} cr`, sub: `${u.generations} generations`, href: `/admin/users/${u.userId}` }))} />
              <Leaderboard title="Top revenue users (all time)" csvName="top-revenue-users.csv"
                items={top.data.topRevenueUsers.map((u) => ({ label: u.label, value: inr(u.revenueInPaise), sub: `${u.purchases} purchases`, href: `/admin/users/${u.userId}` }))} />
              <Leaderboard title="Recent purchases"
                items={top.data.recentPurchases.map((p) => ({
                  label: p.user?.email ?? "?", value: inr(p.amountInPaise),
                  sub: `${p.plan?.name ?? "credits"} · ${timeAgo(p.createdAt)}${p.status === "refunded" ? " · REFUNDED" : ""}`,
                  href: p.user ? `/admin/users/${p.user.id}` : undefined,
                }))} />
              <div className="space-y-5">
                <Leaderboard title="Top countries" items={top.data.countries.map((c) => ({ label: c.label, value: `${c.count} logins` }))} />
                <Leaderboard title="Devices / browsers" items={top.data.devices.map((d) => ({ label: d.label, value: `${d.count}` }))} />
                <p className="text-[10px] text-gray-400 px-1">
                  Login analytics accrue since {top.data.loginDataSince ? new Date(top.data.loginDataSince).toLocaleDateString("en-IN") : "the latest deploy"} — earlier logins weren’t recorded.
                </p>
              </div>
            </div>
          )}
        </div>
      </Row>

      {/* Row 9 — Activity feed */}
      <Row ariaLabel="Activity feed">
        <div ref={activity.ref}>
          {activity.error ? (
            <ErrorCard onRetry={activity.retry} />
          ) : !activity.data ? (
            <Skeleton h="h-72" />
          ) : (
            <ChartContainer title="Activity" subtitle="Live feed from users, billing, generations, coupons and admin actions. Support tickets: no ticketing system exists.">
              <ol className="space-y-0.5 max-h-96 overflow-y-auto pr-1">
                {activity.data.events.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <a href={e.href ?? "#"} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                      <ActivityIcon kind={e.kind} />
                      <span className="flex-1 text-xs text-gray-700 truncate">{e.title}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(e.at)}</span>
                    </a>
                  </li>
                ))}
                {activity.data.events.length === 0 && <p className="text-xs text-gray-400 py-4">No recent activity.</p>}
              </ol>
            </ChartContainer>
          )}
        </div>
      </Row>

      {/* Row 10 — Operations strip */}
      <Row ariaLabel="Operations">
        <div ref={ops.ref}>
          {!ops.data ? (
            <Skeleton h="h-40" />
          ) : (
            <ChartContainer title="Operations" subtitle="Queues, workers and storage — full controls on the Operations page. Email/webhook queues don’t exist (emails send synchronously).">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-2">Render queue</p>
                  {infra.data?.renderQueue ? (
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {Object.entries(infra.data.renderQueue).map(([k, v]) => (
                        <div key={k}>
                          <p className={`text-sm font-bold ${k === "failed" && v > 0 ? "text-red-600" : "text-gray-900"}`}>{v}</p>
                          <p className="text-[9px] text-gray-400 capitalize">{k}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Queue not available.</p>
                  )}
                  <a href="/admin/ops" className="inline-block text-[11px] font-semibold text-blue-600 mt-2">
                    {ops.data.failedJobs.length > 0 ? `Manage ${ops.data.failedJobs.length} failed job(s) →` : "Open Operations →"}
                  </a>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-2">Workers</p>
                  <div className="space-y-1.5">
                    {Object.entries(ops.data.heartbeats).map(([name, beat]) => (
                      <HealthDot key={name} ok={!!beat} label={`${name}${beat ? ` · beat ${timeAgo(beat)}` : " · no heartbeat"}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-2">Storage — largest tables</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {ops.data.tableSizes.slice(0, 5).map((t) => (
                        <tr key={t.table}>
                          <td className="py-0.5 font-mono text-gray-500">{t.table}</td>
                          <td className="py-0.5 text-right font-semibold text-gray-700">{t.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </ChartContainer>
          )}
        </div>
      </Row>
    </AdminShell>
  );
}

function useOps(refreshKey: number) {
  const { token } = useAuth();
  const [data, setData] = useState<Ops | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !token) return;
    fetch("/api/admin/ops", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [visible, token, refreshKey]);

  return { data, ref };
}

function ActivityIcon({ kind }: { kind: string }) {
  const cls = "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0";
  switch (kind) {
    case "user": return <span className={`${cls} bg-blue-50 text-blue-600`}><UserPlus size={12} /></span>;
    case "purchase": return <span className={`${cls} bg-emerald-50 text-emerald-600`}><CreditCard size={12} /></span>;
    case "refund": return <span className={`${cls} bg-red-50 text-red-600`}><RefreshCcw size={12} /></span>;
    case "generation_failed": return <span className={`${cls} bg-amber-50 text-amber-600`}><Zap size={12} /></span>;
    case "coupon": return <span className={`${cls} bg-violet-50 text-violet-600`}><Ticket size={12} /></span>;
    default: return <span className={`${cls} bg-gray-50 text-gray-500`}><ShieldAlert size={12} /></span>;
  }
}
