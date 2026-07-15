"use client";

// Executive operations dashboard. Tabbed sections lazily fetch exactly one
// /api/admin/metrics?section= slice each; 7/30/90d range persisted in the URL.
// Metrics we can't derive yet render as labeled placeholders, never fake zeros.

import { useCallback, useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { useAuth } from "@/app/components/AuthContext";
import { LineChart, StatTile, TypeBars, fmtCompact, fmtPct, type SeriesPoint } from "@/app/components/charts";

const TABS = ["overview", "revenue", "ai", "social", "infra"] as const;
type Tab = (typeof TABS)[number];
const RANGES = [7, 30, 90] as const;

const inr = (paise: number | null | undefined) =>
  paise == null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

// section payload types (mirrors lib/admin/metrics.ts)
interface Kpis {
  mrrInPaise: number; arrInPaise: number; activeSubscribers: number;
  revenueTodayInPaise: number; revenueMtdInPaise: number; revenueGrowthPct: number | null;
  newUsers: number; dauProxy: number; conversionPct: number | null; churnProxyPct: number | null;
  arpuInPaise: number | null; refundRatePct: number | null; totalUsers: number;
  cac: null; ltv: null;
}
interface Revenue {
  series: Array<{ date: string; revenueInPaise: number; purchases: number }>;
  signupSeries: SeriesPoint[];
  byPlan: Array<{ planName: string; revenueInPaise: number; purchases: number }>;
  byKind: Array<{ kind: string; revenueInPaise: number; purchases: number }>;
  creditsSold: number; creditsConsumed: number;
  affiliate: Array<{ status: string; amount: number; count: number }>;
}
interface Ai {
  totalGenerations: number; successRatePct: number | null; failed: number;
  avgLatencyByTool: Array<{ toolSlug: string; avgSeconds: number | null; count: number }>;
  trackedCost: { totalUsd: number; creditsCost: number; generations: number };
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

export default function AdminDashboardPage() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<number>(30);
  const [sections, setSections] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = Number(p.get("range"));
    if (RANGES.includes(r as (typeof RANGES)[number])) setRange(r);
    const t = p.get("tab");
    if (TABS.includes(t as Tab)) setTab(t as Tab);
  }, []);

  const apiSection = tab === "overview" ? "kpis" : tab;
  const cacheKey = `${apiSection}:${range}`;

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(cacheKey);
    try {
      const res = await fetch(`/api/admin/metrics?section=${apiSection}&range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSections((prev) => ({ ...prev, [cacheKey]: d.data }));
      }
    } finally {
      setLoading(null);
    }
  }, [token, user?.role, apiSection, range, cacheKey]);

  useEffect(() => {
    if (!(cacheKey in sections)) load();
  }, [load, cacheKey, sections]);

  function setUrl(nextTab: Tab, nextRange: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("range", String(nextRange));
    window.history.replaceState({}, "", url.toString());
  }

  const data = sections[cacheKey];
  const isLoading = loading === cacheKey && data === undefined;

  return (
    <AdminShell title="Dashboard">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => { setTab(t); setUrl(t, range); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "ai" ? "AI" : t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setUrl(tab, r); }}
              aria-pressed={range === r}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                range === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse" aria-label="Loading metrics">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {tab === "overview" && data !== undefined && <OverviewTab k={data as Kpis} range={range} />}
          {tab === "revenue" && data !== undefined && <RevenueTab r={data as Revenue} range={range} />}
          {tab === "ai" && data !== undefined && <AiTab a={data as Ai} range={range} />}
          {tab === "social" && data !== undefined && <SocialTab s={data as Social} />}
          {tab === "infra" && data !== undefined && <InfraTab i={data as Infra} />}
        </>
      )}
    </AdminShell>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {title && <h2 className="text-sm font-bold text-gray-800 mb-4">{title}</h2>}
      {children}
    </div>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
      {children}
    </div>
  );
}

function PlaceholderTile({ label }: { label: string }) {
  return (
    <div className="bg-gray-50/80 px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-300">—</p>
      <p className="text-[10px] text-gray-400">needs instrumentation</p>
    </div>
  );
}

function OverviewTab({ k, range }: { k: Kpis; range: number }) {
  return (
    <div className="space-y-5">
      <TileGrid>
        <StatTile label="MRR" value={inr(k.mrrInPaise)} sub={`ARR ${inr(k.arrInPaise)}`} />
        <StatTile label="Revenue today" value={inr(k.revenueTodayInPaise)} />
        <StatTile label="Revenue this month" value={inr(k.revenueMtdInPaise)} delta={k.revenueGrowthPct} />
        <StatTile label="Active subscribers" value={fmtCompact(k.activeSubscribers)} />
      </TileGrid>
      <TileGrid>
        <StatTile label={`New users (${range}d)`} value={fmtCompact(k.newUsers)} sub={`${fmtCompact(k.totalUsers)} total`} />
        <StatTile label="Active logins (24h)" value={fmtCompact(k.dauProxy)} sub="login-based proxy" />
        <StatTile label="Paid conversion" value={fmtPct(k.conversionPct)} sub="all-time purchasers / users" />
        <StatTile label="Churn (30d proxy)" value={fmtPct(k.churnProxyPct)} sub="expiries / (expiries+active)" />
      </TileGrid>
      <TileGrid>
        <StatTile label={`ARPU (${range}d)`} value={inr(k.arpuInPaise)} />
        <StatTile label="Refund rate" value={fmtPct(k.refundRatePct)} sub="of all purchases" />
        <PlaceholderTile label="CAC" />
        <PlaceholderTile label="LTV" />
      </TileGrid>
    </div>
  );
}

function RevenueTab({ r, range }: { r: Revenue; range: number }) {
  const revenueSeries: SeriesPoint[] = r.series.map((p) => ({ date: p.date, value: p.revenueInPaise / 100 }));
  const availableAffiliate = r.affiliate.find((a) => a.status === "available");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LineChart points={revenueSeries} color="#2563eb" title={`Daily revenue (₹) — last ${range} days`} valueFmt={(n) => `₹${fmtCompact(n)}`} />
        <LineChart points={r.signupSeries} color="#2563eb" title={`New signups — last ${range} days`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Revenue by plan">
          {r.byPlan.length === 0 ? (
            <p className="text-sm text-gray-400">No purchases in range.</p>
          ) : (
            <TypeBars items={r.byPlan.map((p) => ({ type: `${p.planName} (${p.purchases})`, count: Math.round(p.revenueInPaise / 100), avgEngagementRate: null }))} />
          )}
        </Card>
        <div className="space-y-5">
          <TileGrid>
            <StatTile label="Credits sold" value={fmtCompact(r.creditsSold)} />
            <StatTile label="Credits consumed" value={fmtCompact(r.creditsConsumed)} />
            <StatTile label="Subscription rev." value={inr(r.byKind.find((k) => k.kind === "subscription")?.revenueInPaise ?? 0)} />
            <StatTile label="Pack rev." value={inr(r.byKind.find((k) => k.kind === "pack")?.revenueInPaise ?? 0)} />
          </TileGrid>
          <Card title="Affiliate commissions (all time)">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {r.affiliate.map((a) => (
                <div key={a.status} className="flex justify-between">
                  <span className="text-gray-500 capitalize">{a.status}</span>
                  <span className="font-semibold text-gray-800">₹{a.amount.toFixed(0)} ({a.count})</span>
                </div>
              ))}
              {r.affiliate.length === 0 && <p className="text-gray-400 text-sm col-span-2">No commissions yet.</p>}
            </div>
            {availableAffiliate && availableAffiliate.amount >= 500 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mt-3">₹{availableAffiliate.amount.toFixed(0)} awaiting payout</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AiTab({ a, range }: { a: Ai; range: number }) {
  return (
    <div className="space-y-5">
      <TileGrid>
        <StatTile label={`Generations (${range}d)`} value={fmtCompact(a.totalGenerations)} />
        <StatTile label="Success rate" value={fmtPct(a.successRatePct)} sub={`${a.failed} failed`} />
        <StatTile label="Provider cost" value={`$${a.trackedCost.totalUsd.toFixed(2)}`} sub="tracked tools only" />
        <StatTile label="Credits consumed" value={fmtCompact(a.trackedCost.creditsCost)} sub="on cost-tracked generations" />
      </TileGrid>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Generations by tool">
          <TypeBars items={a.byTool.map((t) => ({ type: t.toolSlug, count: t.generations, avgEngagementRate: null }))} />
        </Card>
        <Card title="Top models">
          {a.topModels.length === 0 ? (
            <p className="text-sm text-gray-400">No registry-model generations in range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                  <th className="font-semibold pb-2">Model</th>
                  <th className="font-semibold pb-2 text-right">Gens</th>
                  <th className="font-semibold pb-2 text-right">Credits</th>
                  <th className="font-semibold pb-2 text-right">Cost $</th>
                  <th className="font-semibold pb-2 text-right">Error %</th>
                </tr>
              </thead>
              <tbody>
                {a.topModels.map((m) => (
                  <tr key={m.modelId} className="border-t border-gray-50">
                    <td className="py-1.5 text-gray-700">{m.modelId}</td>
                    <td className="py-1.5 text-right text-gray-700">{m.generations}</td>
                    <td className="py-1.5 text-right text-gray-500">{fmtCompact(m.creditsCost)}</td>
                    <td className="py-1.5 text-right text-gray-500">{m.costUsd != null ? `$${m.costUsd.toFixed(2)}` : "—"}</td>
                    <td className={`py-1.5 text-right ${m.errorRatePct && m.errorRatePct > 10 ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                      {fmtPct(m.errorRatePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card title="Average generation time by tool (completed)">
        <table className="w-full text-sm">
          <tbody>
            {a.avgLatencyByTool.slice(0, 10).map((l) => (
              <tr key={l.toolSlug} className="border-t border-gray-50 first:border-0">
                <td className="py-1.5 text-gray-700">{l.toolSlug}</td>
                <td className="py-1.5 text-right text-gray-500">{l.count} runs</td>
                <td className="py-1.5 text-right font-semibold text-gray-800 w-24">
                  {l.avgSeconds != null ? `${l.avgSeconds.toFixed(1)}s` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SocialTab({ s }: { s: Social }) {
  const byProvider = new Map<string, number>();
  for (const row of s.accounts) byProvider.set(row.provider, (byProvider.get(row.provider) ?? 0) + row._count);
  return (
    <div className="space-y-5">
      <TileGrid>
        <StatTile label="Connected accounts" value={fmtCompact(s.connectedTotal)} />
        <StatTile label="Followers tracked" value={fmtCompact(s.followersTracked)} />
        <StatTile label="Posts synced" value={fmtCompact(s.postsSynced)} />
        <StatTile
          label="Syncs today"
          value={`${s.syncsToday.ok} ok`}
          sub={s.syncsToday.fail > 0 ? `${s.syncsToday.fail} failed` : "0 failed"}
        />
      </TileGrid>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Accounts by platform">
          <TypeBars items={[...byProvider.entries()].map(([provider, count]) => ({ type: provider, count, avgEngagementRate: null }))} />
        </Card>
        <Card title="Health">
          <div className="space-y-2 text-sm">
            <HealthRow ok={s.needsReauth === 0} label={`${s.needsReauth} account(s) need re-auth`} />
            <HealthRow ok={s.staleOver24h === 0} label={`${s.staleOver24h} account(s) stale >24h`} />
            <HealthRow ok={s.syncsToday.fail === 0} label={`${s.syncsToday.fail} sync failure(s) today`} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfraTab({ i }: { i: Infra }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card title="Services">
          <div className="space-y-2 text-sm">
            <HealthRow ok={i.db} label={`Postgres ${i.db ? "reachable" : "DOWN"}`} />
            <HealthRow ok={i.redis} label={`Redis ${i.redis ? "reachable (write-probe ok)" : "DOWN / write-locked"}`} />
          </div>
        </Card>
        <Card title="Process">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-lg font-bold text-gray-900">{i.process.rssMb}</p><p className="text-xs text-gray-400">RSS MB</p></div>
            <div><p className="text-lg font-bold text-gray-900">{i.process.heapUsedMb}</p><p className="text-xs text-gray-400">Heap MB</p></div>
            <div><p className="text-lg font-bold text-gray-900">{i.process.uptimeHours}</p><p className="text-xs text-gray-400">Uptime h</p></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Process-level only — host CPU/disk needs an infra agent.</p>
        </Card>
      </div>
      <Card title="Render queue (editor-render)">
        {i.renderQueue === null ? (
          <p className="text-sm text-gray-400">Queue not available (in-process driver or not created yet).</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            {Object.entries(i.renderQueue).map(([k, v]) => (
              <div key={k}>
                <p className={`text-lg font-bold ${k === "failed" && v > 0 ? "text-red-600" : "text-gray-900"}`}>{v}</p>
                <p className="text-xs text-gray-400 capitalize">{k}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HealthRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
      <span className={ok ? "text-gray-600" : "text-red-700 font-semibold"}>{label}</span>
      <span className="sr-only">{ok ? "healthy" : "attention needed"}</span>
    </div>
  );
}
