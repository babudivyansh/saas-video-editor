"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Field";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { useCampaignApi } from "./_components/useCampaignApi";
import { STATUS_LABEL, STATUS_TONE, fmtDateTime, type Campaign, type CampaignBudget } from "./_components/types";

const BLOCKED: Record<NonNullable<CampaignBudget["blockedBy"]>, string> = {
  paused: "Paused: non-critical email is switched off on Admin → Email delivery.",
  daily_cap: "Today's campaign cap is used up. Sending carries on after midnight UTC (5:30 AM IST).",
  quota: "The email providers' spare quota for today is used up (40% is held back for sign-in codes, receipts and alerts).",
};

function BudgetCard({ budget }: { budget: CampaignBudget }) {
  const api = useCampaignApi();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState(String(budget.dailyCap));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 0) return showToast("Enter a whole number", "error");
    setSaving(true);
    try {
      await api("/settings", { method: "PUT", body: { dailyCap: n } });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      setEditing(false);
      showToast("Daily cap updated", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const quotaLeft = budget.providerSpare == null ? null : Math.max(0, budget.providerSpare - budget.reserve);
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-fg">Today&apos;s sending budget</h2>
          <p className="text-xs text-fg-subtle mt-1 max-w-xl">
            Campaigns share the free email quota with sign-in codes and receipts, so they only use what is spare, up to a daily cap. Large audiences carry over to the next day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Input type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} className="w-28" aria-label="Daily cap" />
              <Button size="sm" variant="primary" onClick={save} loading={saving}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { setCap(String(budget.dailyCap)); setEditing(true); }}>Change daily cap</Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Tile label="Sent today" value={budget.sentToday.toLocaleString("en-IN")} />
        <Tile label="Daily cap" value={budget.dailyCap.toLocaleString("en-IN")} />
        <Tile label="Spare provider quota" value={quotaLeft == null ? "Not limited" : quotaLeft.toLocaleString("en-IN")} />
        <Tile label="Next batch can send" value={budget.allowed.toLocaleString("en-IN")} />
      </div>
      {budget.blockedBy && <p className="text-xs text-warning mt-3">{BLOCKED[budget.blockedBy]}</p>}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-4 py-3">
      <p className="text-xl font-extrabold text-fg">{value}</p>
      <p className="text-xs text-fg-subtle mt-0.5">{label}</p>
    </div>
  );
}

export default function AdminCampaignsPage() {
  const { token, user } = useAuth();
  const api = useCampaignApi();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => api<{ campaigns: Campaign[]; budget: CampaignBudget }>(""),
    enabled: !!token && user?.role === "ADMIN",
    refetchInterval: (q) => (q.state.data?.campaigns.some((c) => c.status === "sending") ? 20_000 : false),
  });

  return (
    <AdminShell title="Campaigns">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-fg-muted max-w-2xl">
            HTML marketing emails for sales and launches. Only goes to people who have marketing email switched on, and every email carries a one-click unsubscribe.
          </p>
          <Button href="/admin/campaigns/new" variant="primary">New campaign</Button>
        </div>

        {isError ? (
          <ErrorCard onRetry={refetch} />
        ) : isLoading || !data ? (
          <p className="text-sm text-fg-subtle">Loading campaigns…</p>
        ) : (
          <>
            <BudgetCard budget={data.budget} />
            {data.campaigns.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
                <p className="text-sm font-semibold text-fg-muted">No campaigns yet</p>
                <p className="text-xs text-fg-subtle mt-1">Start from the Sale template; it&apos;s set up for Black Friday.</p>
              </section>
            ) : (
              <section className="rounded-2xl border border-line bg-panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                      <th className="py-3 px-5">Campaign</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Audience</th>
                      <th className="py-3 px-3">Sent</th>
                      <th className="py-3 px-3">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                        <td className="py-3 px-5">
                          <Link href={`/admin/campaigns/${c.id}`} className="font-semibold text-fg hover:underline">{c.name}</Link>
                          <p className="text-xs text-fg-subtle truncate max-w-md">{c.subject}</p>
                        </td>
                        <td className="py-3 px-3"><StatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusBadge></td>
                        <td className="py-3 px-3 text-xs text-fg-muted">{c.audienceLabel}</td>
                        <td className="py-3 px-3 text-xs text-fg-muted">
                          {c.audienceCount == null ? "—" : `${c.sentCount.toLocaleString("en-IN")} / ${c.audienceCount.toLocaleString("en-IN")}`}
                        </td>
                        <td className="py-3 px-3 text-xs text-fg-muted whitespace-nowrap">
                          {c.status === "scheduled" ? `Starts ${fmtDateTime(c.scheduledAt)}`
                            : c.completedAt ? fmtDateTime(c.completedAt)
                            : c.startedAt ? `Started ${fmtDateTime(c.startedAt)}`
                            : `Edited ${fmtDateTime(c.updatedAt)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
