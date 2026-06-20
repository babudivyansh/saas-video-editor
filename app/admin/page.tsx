"use client";
import { useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface Stats {
  users: number;
  videosRendered: number;
  rendering: number;
  activePlans: number;
  creditsOutstanding: number;
  revenueInPaise: number;
  purchaseCount: number;
  failedRenders: number;
  activeSubscribers: number;
}
interface MonthlyRevenue { month: string; revenue: number }
interface PlanRevenue { planId: string; planName: string; revenue: number; count: number }
interface ToolUsage { productType: string; count: number }

function inr(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function CssBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-semibold text-gray-700">{inr(value)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats]               = useState<Stats | null>(null);
  const [monthly, setMonthly]           = useState<MonthlyRevenue[]>([]);
  const [byPlan, setByPlan]             = useState<PlanRevenue[]>([]);
  const [toolUsage, setToolUsage]       = useState<ToolUsage[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setStats(d.stats);
        setMonthly(d.monthlyRevenue ?? []);
        setByPlan(d.revenueByPlan ?? []);
        setToolUsage(d.toolUsage ?? []);
      })
      .finally(() => setLoading(false));
  }, [token, user?.role]);

  const kpis = [
    { label: "Total Users",          value: stats?.users ?? "—" },
    { label: "Active Subscribers",   value: stats?.activeSubscribers ?? "—" },
    { label: "Videos Rendered",      value: stats?.videosRendered ?? "—" },
    { label: "Currently Rendering",  value: stats?.rendering ?? "—" },
    { label: "Failed Renders",       value: stats?.failedRenders ?? "—", warn: (stats?.failedRenders ?? 0) > 0 },
    { label: "Active Plans",         value: stats?.activePlans ?? "—" },
    { label: "Credits Outstanding",  value: stats?.creditsOutstanding ?? "—" },
    { label: "Total Purchases",      value: stats?.purchaseCount ?? "—" },
    { label: "Total Revenue",        value: stats ? inr(stats.revenueInPaise) : "—", big: true },
  ];

  const maxMonthly = Math.max(...monthly.map(m => m.revenue), 1);
  const maxPlan    = Math.max(...byPlan.map(p => p.revenue), 1);
  const maxTool    = Math.max(...toolUsage.map(t => t.count), 1);

  return (
    <AdminShell title="Dashboard">
      {loading ? (
        <p className="text-sm text-gray-400">Loading stats…</p>
      ) : (
        <div className="space-y-8">

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {kpis.map(c => (
              <div key={c.label} className={`bg-white rounded-2xl border shadow-sm p-5 ${c.warn ? "border-red-200" : "border-gray-100"}`}>
                <p className={`text-3xl font-extrabold ${c.warn ? "text-red-500" : c.big ? "text-blue-600" : "text-gray-900"}`}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Revenue over time — CSS bars */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-800 mb-5">Revenue — Last 6 Months</h2>
            <div className="flex items-end gap-3 h-36">
              {monthly.map(m => {
                const pct = maxMonthly > 0 ? (m.revenue / maxMonthly) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] text-gray-500 font-semibold">{inr(m.revenue)}</span>
                    <div className="w-full bg-blue-500 rounded-t-lg transition-all" style={{ height: `${Math.max(pct, 2)}%` }} />
                    <span className="text-[10px] text-gray-400 text-center leading-tight">{m.month.replace(" 20", " '")}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue by plan */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-800 mb-4">Revenue by Plan</h2>
              {byPlan.length === 0 ? (
                <p className="text-sm text-gray-400">No purchase data yet.</p>
              ) : (
                <div className="space-y-3">
                  {byPlan.map(p => (
                    <CssBar key={p.planId} value={p.revenue} max={maxPlan} label={`${p.planName} (${p.count})`} />
                  ))}
                </div>
              )}
            </div>

            {/* Tool usage */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-800 mb-4">Video Type Usage</h2>
              {toolUsage.length === 0 ? (
                <p className="text-sm text-gray-400">No project data yet.</p>
              ) : (
                <div className="space-y-3">
                  {toolUsage.map(t => (
                    <div key={t.productType} className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span className="truncate max-w-[60%]">{t.productType}</span>
                        <span className="font-semibold text-gray-700">{t.count}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.round((t.count / maxTool) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </AdminShell>
  );
}
