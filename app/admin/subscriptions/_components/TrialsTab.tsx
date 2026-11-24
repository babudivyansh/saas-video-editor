"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { ErrorCard } from "../../dashboard/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { TRIAL_OUTCOMES, TRIAL_OUTCOME_LABEL, type TrialOutcome } from "@/lib/billing/billing-status-labels";
import { Chip, OUTCOME_TONE, Pager, SEARCH_INPUT, downloadCsv, fmtDate, type SubscriptionsResponse, type TrialRow } from "./shared";

const LIMIT = 50;

export function TrialsTab({
  outcome,
  onOutcome,
  onCounts,
}: {
  outcome: TrialOutcome | "";
  onOutcome: (o: TrialOutcome | "") => void;
  onCounts: (d: SubscriptionsResponse<unknown>) => void;
}) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [exporting, setExporting] = useState(false);

  const params = () => {
    const p = new URLSearchParams({ view: "trials", page: String(page), limit: String(LIMIT) });
    if (outcome) p.set("outcome", outcome);
    if (search) p.set("search", search);
    return p;
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-subscriptions", "trials", outcome, page, search],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions?${params()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load trials");
      const d = (await res.json()) as SubscriptionsResponse<TrialRow>;
      onCounts(d);
      return d;
    },
    enabled: !!token,
  });

  const onExport = async () => {
    setExporting(true);
    try {
      const p = params();
      p.delete("page");
      p.delete("limit");
      await downloadCsv(`/api/admin/subscriptions/export?${p}`, token, "clipiro-trials.csv");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.trialSummary;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Trial outcome">
          <Chip active={outcome === ""} onClick={() => { onOutcome(""); setPage(1); }} label="All trials" count={summary?.total} />
          {TRIAL_OUTCOMES.map((o) => (
            <Chip key={o} active={outcome === o} onClick={() => { onOutcome(o); setPage(1); }} label={TRIAL_OUTCOME_LABEL[o]} count={summary?.counts[o]} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="Search by email or name…"
            aria-label="Search trials"
            className={SEARCH_INPUT}
          />
          <Button variant="secondary" size="sm" onClick={onExport} loading={exporting}>Export CSV</Button>
        </div>
      </div>
      <p className="text-[11px] text-fg-subtle max-w-3xl">
        &quot;Mandate revoked&quot; means Razorpay cancelled the subscription without Clipiro asking: the customer revoked the card or UPI AutoPay mandate at their bank or UPI app, or it was cancelled on the Razorpay dashboard. &quot;Cancelled in app&quot; was the Cancel button (or an admin).
      </p>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading || !data ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center">
          <p className="text-sm font-semibold text-fg-muted">{search ? "No matches" : "No trials here yet"}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                  <th className="py-3.5 px-5">User</th>
                  <th className="py-3.5 px-3">Started</th>
                  <th className="py-3.5 px-3">Ends</th>
                  <th className="py-3.5 px-3">Outcome</th>
                  <th className="py-3.5 px-3">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.subscriptionId} className="border-b border-line last:border-0">
                    <td className="py-3 px-5">
                      <Link href={`/admin/users/${t.userId}`} className="font-semibold text-fg hover:underline">{t.name || t.email}</Link>
                      {t.name && <p className="text-xs text-fg-subtle">{t.email}</p>}
                    </td>
                    <td className="py-3 px-3 text-xs text-fg-muted whitespace-nowrap">{fmtDate(t.startedAt)}</td>
                    <td className="py-3 px-3 text-xs text-fg-muted whitespace-nowrap">
                      {fmtDate(t.endsAt)}
                      {t.endsAtEstimated && <span className="text-fg-subtle" title="Start date plus the current trial length"> (est.)</span>}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge tone={OUTCOME_TONE[t.outcome]}>{TRIAL_OUTCOME_LABEL[t.outcome]}</StatusBadge>
                      {t.detail && <p className="text-[11px] text-fg-subtle mt-1">{t.detail}</p>}
                    </td>
                    <td className="py-3 px-3 text-xs text-fg-muted whitespace-nowrap">{fmtDate(t.outcomeAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={data.total} limit={LIMIT} onPage={setPage} noun="trials" />
        </div>
      )}
    </div>
  );
}
