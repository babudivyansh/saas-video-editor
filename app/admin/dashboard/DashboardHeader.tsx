"use client";

// Executive dashboard header: environment badge, quick search (admin pages +
// user email jump), range pills, auto-refresh toggle, manual refresh,
// notifications bell (real signals only), and a system health dot.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw, Search } from "lucide-react";
import { ADMIN_NAV } from "../nav-config";

// Derived from the shared nav (minus "Dashboard" — you're already here) so
// this jump-search list can't drift out of sync with the sidebar the way
// its previous hand-maintained copy did (it was missing "Reviews").
const PAGES = ADMIN_NAV.filter((item) => item.href !== "/admin").map(({ label, href }) => ({ label, href }));

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
          env === "production" ? "bg-error/10 text-error border border-error/30" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
        }`}
      >
        {env ?? "…"}
      </span>
      <span
        className={`w-2.5 h-2.5 rounded-full ${healthOk === null ? "bg-surface-3" : healthOk ? "bg-success" : "bg-error animate-pulse"}`}
        title={healthOk === null ? "Checking system health…" : healthOk ? "All systems healthy" : "System degraded — check Operations"}
        aria-label={healthOk === null ? "health unknown" : healthOk ? "system healthy" : "system degraded"}
      />

      {/* Search */}
      <form onSubmit={submitSearch} className="relative flex-1 min-w-40 max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          list="admin-pages"
          placeholder="Jump to page or search users…"
          aria-label="Search admin"
          className="w-full text-xs border border-line rounded-xl pl-7 pr-2 py-2 bg-panel"
        />
        <datalist id="admin-pages">
          {PAGES.map((p) => (
            <option key={p.href} value={p.label} />
          ))}
        </datalist>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* Range pills */}
        <div className="flex items-center gap-1 bg-surface-3 rounded-xl p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRange(r)}
              aria-pressed={range === r}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer ${range === r ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              {r === 365 ? "1y" : `${r}d`}
            </button>
          ))}
        </div>

        {/* Auto refresh */}
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => onAutoRefresh(e.target.checked)} />
          Auto 30s
        </label>

        <button
          onClick={onRefresh}
          className="p-2 rounded-xl border border-line text-fg-muted hover:text-brand cursor-pointer bg-panel"
          title="Refresh now"
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setBellOpen((o) => !o)}
            className="p-2 rounded-xl border border-line text-fg-muted hover:text-brand cursor-pointer bg-panel relative"
            aria-label={`Notifications (${alerts.length})`}
          >
            <Bell size={14} />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-error text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center">
                {alerts.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-10 z-30 bg-panel border border-line rounded-xl shadow-lg p-2 w-64">
              {alerts.length === 0 ? (
                <p className="text-xs text-fg-subtle p-2">Nothing needs attention.</p>
              ) : (
                alerts.map((a) => (
                  <a key={a.label} href={a.href} className="block text-xs text-fg hover:bg-surface-2 rounded-lg px-2 py-1.5">
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
