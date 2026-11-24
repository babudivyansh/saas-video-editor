"use client";
import type { BillingStatus, TrialOutcome } from "@/lib/billing/billing-status-labels";
import type { StatusTone } from "@/app/components/ui/StatusBadge";

export type RunningStatus = "paid" | "paid_cancelling" | "payment_failed" | "trial" | "trial_cancelled";

export interface TrialSummary {
  total: number;
  counts: Record<TrialOutcome, number>;
  conversionRate: number | null;
}

export interface SubscriptionsResponse<Row> {
  view: "subscribers" | "trials";
  rows: Row[];
  total: number;
  page: number;
  limit: number;
  statusCounts: Record<RunningStatus, number>;
  trialSummary: TrialSummary;
}

export interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  plan: { id: string; name: string; slug: string } | null;
  billingStatus: BillingStatus;
  credits: number;
  monthlyCredits: number;
  minutes: number;
  monthlyMinutes: number;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  nextRefillAt: string | null;
  cancelledAt: string | null;
  cancelSource: "in_app" | "external" | null;
  cancelDetail: string | null;
  paymentFailedAt: string | null;
  recurring: boolean;
}

export interface TrialRow {
  userId: string;
  email: string;
  name: string | null;
  subscriptionId: string;
  startedAt: string;
  endsAt: string;
  endsAtEstimated: boolean;
  outcome: TrialOutcome;
  outcomeAt: string | null;
  detail: string | null;
}

export const STATUS_TONE: Record<BillingStatus, StatusTone> = {
  paid: "success",
  paid_cancelling: "warning",
  payment_failed: "error",
  trial: "info",
  trial_cancelled: "neutral",
  lapsed: "neutral",
  free: "neutral",
};

export const OUTCOME_TONE: Record<TrialOutcome, StatusTone> = {
  active: "info",
  converted: "success",
  cancelled_in_app: "warning",
  mandate_revoked: "error",
  payment_failed: "error",
  ended: "neutral",
};

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active ? "bg-primary/15 border-primary/40 text-fg" : "border-line text-fg-muted hover:text-fg"
      }`}
    >
      {label}
      {count != null && <span className="ml-1.5 text-fg-subtle">{count.toLocaleString("en-IN")}</span>}
    </button>
  );
}

export const SEARCH_INPUT =
  "w-72 max-w-full bg-panel border border-line rounded-xl px-4 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/40";

/** Download a CSV from an admin endpoint that needs the bearer header. */
export async function downloadCsv(url: string, token: string | null, fallbackName: string): Promise<void> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Pager({ page, total, limit, onPage, noun }: { page: number; total: number; limit: number; onPage: (p: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-line text-xs text-fg-muted">
      <span>Page {page} of {pages} · {total.toLocaleString("en-IN")} {noun}</span>
      <div className="flex gap-2">
        <button type="button" className="rounded-full border border-line px-3 py-1 disabled:opacity-40" onClick={() => onPage(page - 1)} disabled={page <= 1}>Prev</button>
        <button type="button" className="rounded-full border border-line px-3 py-1 disabled:opacity-40" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next</button>
      </div>
    </div>
  );
}
