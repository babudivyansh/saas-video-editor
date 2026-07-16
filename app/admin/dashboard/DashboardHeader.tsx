"use client";

// Executive dashboard header: environment badge, quick search (admin pages +
// user email jump), range pills, auto-refresh toggle, manual refresh,
// notifications bell (real signals only), and a system health dot.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw, Search } from "lucide-react";

const PAGES = [
  { label: "Users", href: "/admin/users" },
  { label: "Subscriptions", href: "/admin/subscriptions" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Coupons", href: "/admin/coupons" },
  { label: "Tools", href: "/admin/tools" },
  { label: "AI Models", href: "/admin/models" },
  { label: "Purchases", href: "/admin/purchases" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Operations", href: "/admin/ops" },
  { label: "Audit Log", href: "/admin/audit" },
  { label: "Affiliates", href: "/admin/affiliate" },
];

export const RANGES = [7, 30, 90, 365] as const;

export function DashboardHeader({
  env,
  range,
  onRange,
  autoRefresh,
  onAutoRefresh,
  onRefresh,
  refreshing,
  healthOk,
  alerts,
}: {
  env: string | null;
  range: number;
  onRange: (r: number) => void;
  autoRefresh: boolean;
  onAutoRefresh: (v: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  healthOk: boolean | null;
  alerts: Array<{ label: string; href: string }>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [bellOpen, setBellOpen] = useState(false);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const page = PAGES.find((p) => p.label.toLowerCase().startsWith(term.toLowerCase()));
    router.push(page ? page.href : `/admin/users?search=${encodeURIComponent(term)}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-6">
      {/* Env badge + health */}
      <span
        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
          env === "production" ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
        }`}
      >
        {env ?? "…"}
      </span>
      <span
        className={`w-2.5 h-2.5 rounded-full ${healthOk === null ? "bg-gray-200" : healthOk ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}
        title={healthOk === null ? "Checking system health…" : healthOk ? "All systems healthy" : "System degraded — check Operations"}
        aria-label={healthOk === null ? "health unknown" : healthOk ? "system healthy" : "system degraded"}
      />

      {/* Search */}
      <form onSubmit={submitSearch} className="relative flex-1 min-w-40 max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          list="admin-pages"
          placeholder="Jump to page or search users…"
          aria-label="Search admin"
          className="w-full text-xs border border-gray-200 rounded-xl pl-7 pr-2 py-2 bg-white"
        />
        <datalist id="admin-pages">
          {PAGES.map((p) => (
            <option key={p.href} value={p.label} />
          ))}
        </datalist>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* Range pills */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRange(r)}
              aria-pressed={range === r}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer ${range === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {r === 365 ? "1y" : `${r}d`}
            </button>
          ))}
        </div>

        {/* Auto refresh */}
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => onAutoRefresh(e.target.checked)} />
          Auto 30s
        </label>

        <button
          onClick={onRefresh}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-blue-600 cursor-pointer bg-white"
          title="Refresh now"
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setBellOpen((o) => !o)}
            className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-blue-600 cursor-pointer bg-white relative"
            aria-label={`Notifications (${alerts.length})`}
          >
            <Bell size={14} />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center">
                {alerts.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-10 z-30 bg-white border border-gray-100 rounded-xl shadow-lg p-2 w-64">
              {alerts.length === 0 ? (
                <p className="text-xs text-gray-400 p-2">Nothing needs attention.</p>
              ) : (
                alerts.map((a) => (
                  <a key={a.label} href={a.href} className="block text-xs text-gray-700 hover:bg-gray-50 rounded-lg px-2 py-1.5">
                    ⚠ {a.label}
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
