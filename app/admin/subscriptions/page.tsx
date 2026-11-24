"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell from "../AdminShell";
import { Tabs } from "@/app/components/ui/Tabs";
import { TRIAL_OUTCOMES, type TrialOutcome } from "@/lib/billing/billing-status-labels";
import { SubscribersTab } from "./_components/SubscribersTab";
import { TrialsTab } from "./_components/TrialsTab";
import type { RunningStatus, SubscriptionsResponse } from "./_components/shared";

const RUNNING: RunningStatus[] = ["paid", "paid_cancelling", "payment_failed", "trial", "trial_cancelled"];

function Tile({ label, value, hint, tone = "text-fg" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-5 py-4">
      <p className={`text-3xl font-extrabold ${tone}`}>{value}</p>
      <p className="text-xs text-fg-subtle mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-fg-subtle mt-1">{hint}</p>}
    </div>
  );
}

function SubscriptionsConsole() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = sp.get("tab") === "trials" ? "trials" : "subscribers";
  const statusParam = sp.get("status") ?? "";
  const status = (RUNNING as string[]).includes(statusParam) ? (statusParam as RunningStatus) : "";
  const outcomeParam = sp.get("outcome") ?? "";
  const outcome = (TRIAL_OUTCOMES as readonly string[]).includes(outcomeParam) ? (outcomeParam as TrialOutcome) : "";
  const [summary, setSummary] = useState<SubscriptionsResponse<unknown> | null>(null);

  // Tab and filter live in the URL, so a view can be linked to.
  const go = (next: { tab?: string; status?: string; outcome?: string }) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    p.set("tab", t);
    const st = next.status ?? (t === "subscribers" ? status : "");
    const oc = next.outcome ?? (t === "trials" ? outcome : "");
    if (t === "subscribers" && st) p.set("status", st);
    if (t === "trials" && oc) p.set("outcome", oc);
    router.replace(`/admin/subscriptions?${p}`, { scroll: false });
  };

  const c = summary?.statusCounts;
  const t = summary?.trialSummary;
  const n = (v: number | undefined) => (v == null ? "…" : v.toLocaleString("en-IN"));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Paying" value={n(c?.paid)} tone="text-success" />
        <Tile label="Cancelled renewal" value={n(c?.paid_cancelling)} hint="Access until the term ends" />
        <Tile label="Payment failed" value={n(c?.payment_failed)} tone={c?.payment_failed ? "text-error" : "text-fg"} />
        <Tile label="In trial" value={n(c?.trial)} hint="Will be charged when it ends" />
        <Tile label="Trials cancelled" value={n(c?.trial_cancelled)} hint="Running out, never charged" />
        <Tile
          label="Trial conversion"
          value={t?.conversionRate == null ? "—" : `${Math.round(t.conversionRate * 100)}%`}
          hint={t ? `${t.counts.converted} of ${t.total - t.counts.active} finished · ${t.counts.mandate_revoked} mandate${t.counts.mandate_revoked === 1 ? "" : "s"} revoked` : undefined}
        />
      </div>

      <Tabs
        label="Subscriptions"
        activeId={tab}
        onChange={(id) => go({ tab: id })}
        items={[
          {
            id: "subscribers",
            label: "Subscribers",
            content: <SubscribersTab status={status} onStatus={(s) => go({ status: s })} onCounts={setSummary} />,
          },
          {
            id: "trials",
            label: "Trials",
            content: <TrialsTab outcome={outcome} onOutcome={(o) => go({ outcome: o })} onCounts={setSummary} />,
          },
        ]}
      />
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  return (
    <AdminShell title="Subscriptions">
      <Suspense fallback={null}>
        <SubscriptionsConsole />
      </Suspense>
    </AdminShell>
  );
}
