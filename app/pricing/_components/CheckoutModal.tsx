"use client";

// Plan checkout: the selected plan on the left, order summary and pay on the
// right. Presentation only — the Razorpay call stays in the page.
//
// A subscription is exactly its plan. The modal used to offer add-on packs and
// a coupon field here too, but a subscription is billed at its synced Razorpay
// plan amount, so neither was ever charged or applied — the total shown was
// not the total taken. Both are gone (2026-09-25); packs are bought on their
// own and pack coupons still apply there.

import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { Modal } from "@/app/components/ui/Modal";
import { formatMoney, type Currency } from "@/lib/currency-shared";
import { minorUnits } from "@/lib/plans/display";
import type { DbPlan } from "./types";

// Modal.tsx reads useTranslations("Common") for its close-button label, and
// /pricing sits outside the dashboard's NextIntlClientProvider tree (that is
// mounted only under /dashboard, see app/components/AppShellLayout.tsx). Supply
// just that namespace locally, the same way ReportReviewModal does on /reviews.
const COMMON_MESSAGES = { Common: { cancel: "Cancel", confirm: "Confirm", close: "Close" } };

export function CheckoutModal(props: {
  plan: DbPlan;
  trial: boolean;
  currency: Currency;
  /** Shown when the buyer already has a running plan that this purchase resets. */
  activePlanEndsAt: string | null;
  loading: boolean;
  error: string;
  onPay: () => void;
  onClose: () => void;
}) {
  const { plan, trial, currency, activePlanEndsAt, loading, error, onPay, onClose } = props;
  const months = plan.intervalMonths ?? 1;
  const termLabel = months > 1 ? `${months} months` : "1 month";
  const priceMinor = minorUnits(plan, currency);
  const dueNow = trial ? 0 : priceMinor;

  return (
    <NextIntlClientProvider locale="en" messages={COMMON_MESSAGES}>
      <Modal open onClose={() => { if (!loading) onClose(); }} title="Checkout" maxWidth="max-w-3xl">
        {/* Negative margin cancels Modal's own p-5 so the two panes run edge to
            edge; overflow-hidden keeps the tinted left pane inside the corners. */}
        <div className="-m-5 flex min-h-0 flex-1 flex-col overflow-hidden overflow-y-auto rounded-b-[var(--radius-card)] md:flex-row">

          {/* LEFT: the plan */}
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-surface-1 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary bg-surface-2 p-5">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
                  {trial ? "7-day free trial" : "Selected plan"}
                </span>
                <span className="truncate text-lg font-semibold text-fg">{plan.name}</span>
                <span className="text-[13px] text-fg-muted">{plan.monthlyCredits} credits every month</span>
              </div>
              <span className="whitespace-nowrap text-2xl font-semibold text-fg">
                {formatMoney(priceMinor, currency)}
                <span className="ml-1 text-sm font-normal text-fg-muted">/ {months > 1 ? `${months} mo` : "mo"}</span>
              </span>
            </div>

            {activePlanEndsAt && (
              <div role="note" className="flex gap-3 rounded-2xl border border-tint-amber-border bg-tint-amber p-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-warning" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-[13px] leading-relaxed text-fg-muted">
                  <strong className="text-warning">You already have an active plan.</strong> Buying now starts a new {`${termLabel} term`} today. It doesn&apos;t extend your current one (active until{" "}
                  {new Date(activePlanEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).
                </p>
              </div>
            )}

            <p className="text-[13px] leading-relaxed text-fg-subtle">
              Need extra credits? Credit packs never expire and can be bought any time from{" "}
              <Link href="/dashboard?billing=1&tab=topup" className="text-primary underline-offset-2 hover:underline">Billing</Link>.
            </p>
          </div>

          {/* RIGHT: order summary */}
          <div className="flex w-full flex-shrink-0 flex-col gap-4 border-t border-line p-6 sm:p-7 md:w-[300px] md:border-l md:border-t-0">
            <h3 className="text-[15px] font-semibold text-fg">Order summary</h3>

            <div className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg-muted">{plan.name}</span>
              <span className="whitespace-nowrap text-fg">{formatMoney(priceMinor, currency)}</span>
            </div>

            <div className="border-t border-line pt-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-fg">{trial ? "Due today" : "Total due"}</span>
                <span className="text-2xl font-semibold text-fg">{formatMoney(dueNow, currency)}</span>
              </div>
              {trial && (
                <p className="mt-1.5 text-xs text-fg-muted">
                  Free for 7 days, then {formatMoney(priceMinor, currency)}/{months > 1 ? `${months} mo` : "mo"}. Cancel any time before it ends.
                </p>
              )}
            </div>

            <div className="flex-1" />
            {error && (
              <p role="alert" className="rounded-xl border border-tint-rose-border bg-tint-rose px-3 py-2 text-xs text-error">{error}</p>
            )}
            <button
              type="button"
              onClick={onPay}
              disabled={loading}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary/30 border-t-on-primary" />Processing…</>
              ) : trial ? "Start free trial" : `Pay ${formatMoney(dueNow, currency)}`}
            </button>
            <p className="text-center text-xs leading-relaxed text-fg-subtle">
              Secure payment via Razorpay · 3-day money-back
              <br />
              By continuing you agree to the{" "}
              <Link href="/terms" className="underline hover:text-fg">Terms</Link> and{" "}
              <Link href="/refund" className="underline hover:text-fg">Refund Policy</Link>.
            </p>
          </div>
        </div>
      </Modal>
    </NextIntlClientProvider>
  );
}
