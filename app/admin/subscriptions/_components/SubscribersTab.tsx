"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { ErrorCard } from "../../dashboard/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { BILLING_STATUS_LABEL } from "@/lib/billing/billing-status-labels";
import {
  Chip, Pager, SEARCH_INPUT, STATUS_TONE, daysLeft, downloadCsv, fmtDate,
  type RunningStatus, type SubscriberRow, type SubscriptionsResponse,
} from "./shared";

const LIMIT = 50;
const STATUSES: RunningStatus[] = ["paid", "paid_cancelling", "payment_failed", "trial", "trial_cancelled"];

export function SubscribersTab({
  status,
  onStatus,
  onCounts,
}: {
  status: RunningStatus | "";
  onStatus: (s: RunningStatus | "") => void;
  onCounts: (d: SubscriptionsResponse<unknown>) => void;
}) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [extendMonths, setExtendMonths] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const params = () => {
    const p = new URLSearchParams({ view: "subscribers", page: String(page), limit: String(LIMIT) });
    if (status) p.set("status", status);
    if (search) p.set("search", search);
    return p;
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-subscriptions", "subscribers", status, page, search],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions?${params()}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load subscriptions");
      const d = (await res.json()) as SubscriptionsResponse<SubscriberRow>;
      onCounts(d);
      return d;
    },
    enabled: !!token,
  });

  const refill = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/subscriptions/refill", { method: "POST", headers: headers(), body: JSON.stringify({ userId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Refill failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }); showToast("Credits refilled", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
    onSettled: () => setActingId(null),
  });

  const adjust = useMutation({
    mutationFn: async ({ userId, opts }: { userId: string; opts: { months?: number; expire?: boolean } }) => {
      const res = await fetch("/api/admin/subscriptions/extend", { method: "POST", headers: headers(), body: JSON.stringify({ userId, ...opts }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
    },
    onSuccess: (_d, { opts }) => { queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }); showToast(opts.expire ? "Subscription expired" : "Subscription extended", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
    onSettled: () => setActingId(null),
  });

  const onExport = async () => {
    setExporting(true);
    try {
      const p = params();
      p.delete("page");
      p.delete("limit");
      await downloadCsv(`/api/admin/subscriptions/export?${p}`, token, "clipiro-subscribers.csv");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const counts = data?.statusCounts;
  const allRunning = counts ? STATUSES.reduce((n, s) => n + counts[s], 0) : undefined;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Billing status">
          <Chip active={status === ""} onClick={() => { onStatus(""); setPage(1); }} label="Everyone running" count={allRunning} />
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => { onStatus(s); setPage(1); }} label={BILLING_STATUS_LABEL[s]} count={counts?.[s]} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="Search by email or name…"
            aria-label="Search subscribers"
            className={SEARCH_INPUT}
          />
          <Button variant="secondary" size="sm" onClick={onExport} loading={exporting}>Export CSV</Button>
        </div>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading || !data ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center">
          <p className="text-sm font-semibold text-fg-muted">{search ? "No matches" : "Nobody in this group right now"}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                  <th className="py-3.5 px-5">User</th>
                  <th className="py-3.5 px-3">Plan</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Access until</th>
                  <th className="py-3.5 px-3">Balance</th>
                  <th className="py-3.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const end = s.trialEndsAt ?? s.subscriptionEndsAt;
                  const left = daysLeft(end);
                  const soon = left != null && left >= 0 && left <= 3;
                  const busy = actingId === s.id;
                  const months = parseInt(extendMonths[s.id] ?? "1", 10) || 1;
                  const inTrial = s.billingStatus === "trial" || s.billingStatus === "trial_cancelled";
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0 align-top">
                      <td className="py-3 px-5">
                        <Link href={`/admin/users/${s.id}`} className="font-semibold text-fg hover:underline">{s.name || s.email}</Link>
                        {s.name && <p className="text-xs text-fg-subtle">{s.email}</p>}
                      </td>
                      <td className="py-3 px-3 text-xs text-fg-muted">
                        {s.plan?.name ?? "—"}
                        <p className="text-[11px] text-fg-subtle">{s.recurring ? "Auto-renewing" : "Prepaid / granted"}</p>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge tone={STATUS_TONE[s.billingStatus]}>{BILLING_STATUS_LABEL[s.billingStatus]}</StatusBadge>
                        {s.cancelledAt && (
                          <p className="text-[11px] text-fg-subtle mt-1">
                            {s.cancelSource === "external" ? "Mandate revoked at bank / UPI" : `Cancelled ${s.cancelDetail ?? "in app"}`} · {fmtDate(s.cancelledAt)}
                          </p>
                        )}
                        {s.paymentFailedAt && !s.cancelledAt && <p className="text-[11px] text-error mt-1">Failed {fmtDate(s.paymentFailedAt)}</p>}
                        {s.billingStatus === "trial" && <p className="text-[11px] text-fg-subtle mt-1">First charge {fmtDate(s.trialEndsAt)}</p>}
                        {s.billingStatus === "trial_cancelled" && <p className="text-[11px] text-fg-subtle mt-1">Won&apos;t be charged</p>}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span className="text-fg-muted">{fmtDate(end)}</span>
                        {left != null && (
                          <p className={`text-[11px] font-bold ${soon ? "text-warning" : "text-fg-subtle"}`}>{left < 0 ? "ended" : `${left}d left`}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-fg-muted">
                        <span className="font-semibold text-fg">{s.minutes.toLocaleString("en-IN")} min</span>
                        <p className="text-[11px] text-fg-subtle">{s.credits} cr · next refill {fmtDate(s.nextRefillAt)}</p>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1.5">
                          {!inTrial && (
                            <Button onClick={() => { setActingId(s.id); refill.mutate(s.id); }} disabled={busy} variant="primary" size="sm">
                              {busy ? "…" : `+${s.monthlyCredits} Refill`}
                            </Button>
                          )}
                          <div className="flex gap-1">
                            <input
                              type="number" min={1} max={24} aria-label="Months to extend"
                              value={extendMonths[s.id] ?? "1"}
                              onChange={(e) => setExtendMonths((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              className="w-12 bg-surface-2 border border-line rounded-md text-xs px-1.5 py-1 text-center text-fg focus:outline-none"
                            />
                            <Button onClick={() => { setActingId(s.id); adjust.mutate({ userId: s.id, opts: { months } }); }} disabled={busy} variant="secondary" size="sm">
                              +{months}mo
                            </Button>
                          </div>
                          <Button onClick={() => { setActingId(s.id); adjust.mutate({ userId: s.id, opts: { expire: true } }); }} disabled={busy} variant="danger" size="sm">
                            Expire now
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} limit={LIMIT} onPage={setPage} noun="accounts" />
        </div>
      )}
    </div>
  );
}
