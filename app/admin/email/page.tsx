"use client";

// Admin → Email: multi-provider delivery (Brevo → Mailjet → Resend).
// One snapshot (GET /api/admin/email/overview) for Overview / Providers /
// Alerts; Activity pages through /api/admin/email/messages on its own.
// ?tab= deep-links a tab (the alert notifications link to ?tab=alerts).

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { Tabs } from "@/app/components/ui/Tabs";
import { OverviewTab } from "./_components/OverviewTab";
import { ProvidersTab } from "./_components/ProvidersTab";
import { ActivityTab } from "./_components/ActivityTab";
import { AlertsTab } from "./_components/AlertsTab";
import type { EmailOverview } from "./_components/types";

const TAB_IDS = ["overview", "providers", "activity", "alerts"] as const;
const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
] as const;
const INPUT = "rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm text-fg";

function EmailConsole() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab = (TAB_IDS as readonly string[]).includes(requested ?? "") ? (requested as string) : "overview";
  const [range, setRange] = useState<string>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);
  const custom = range === "custom" && from && to;
  const rangeParams = {
    range: range === "custom" && !custom ? "7d" : range,
    ...(custom ? { from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  };
  const qs = new URLSearchParams(rangeParams).toString();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-email", qs],
    queryFn: async () => {
      const res = await fetch(`/api/admin/email/overview?${qs}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load email data");
      return (await res.json()) as EmailOverview;
    },
    enabled: !!token,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const go = (id: string) => router.replace(`/admin/email?tab=${id}`, { scroll: false });

  if (isError) return <ErrorCard onRetry={refetch} />;
  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-surface-3 rounded-xl" />
        <div className="h-32 bg-surface-3 rounded-2xl" />
        <div className="h-64 bg-surface-3 rounded-2xl" />
      </div>
    );
  }

  const providerTrouble = data.providers.filter((p) => p.enabled && p.configured && ["unavailable", "misconfigured", "suspended", "quota_exhausted"].includes(p.status)).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button key={r.id} type="button" onClick={() => setRange(r.id)} aria-pressed={range === r.id}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${range === r.id ? "bg-primary/15 border-primary/40 text-fg" : "border-line text-fg-muted hover:text-fg"}`}>
            {r.label}
          </button>
        ))}
        {range === "custom" && (
          <>
            <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
            <span className="text-fg-subtle text-xs">to</span>
            <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} />
            {!custom && <span className="text-xs text-fg-subtle">Pick both dates (max 92 days)</span>}
          </>
        )}
      </div>
      {!data.settings.routerEnabled && (
        <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-4 py-2 mb-4">
          Router OFF — only messages sent through the new router appear here. Set EMAIL_ROUTER_ENABLED=true to turn it on.
        </p>
      )}
      <Tabs
        label="Email"
        activeId={tab}
        onChange={go}
        items={[
          { id: "overview", label: "Overview", content: <OverviewTab data={data} /> },
          { id: "providers", label: "Providers", badge: providerTrouble > 0 ? providerTrouble : undefined, content: <ProvidersTab data={data} headers={headers} /> },
          { id: "activity", label: "Activity", content: <ActivityTab headers={headers} range={rangeParams} /> },
          { id: "alerts", label: "Alerts", badge: data.alerts.open.length > 0 ? data.alerts.open.length : undefined, content: <AlertsTab data={data} headers={headers} /> },
        ]}
      />
    </>
  );
}

export default function AdminEmailPage() {
  return (
    <AdminShell title="Email delivery">
      <Suspense fallback={null}>
        <EmailConsole />
      </Suspense>
    </AdminShell>
  );
}
