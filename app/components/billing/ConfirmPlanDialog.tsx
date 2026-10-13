"use client";

// The step after picking a plan on the upgrade page: a compact dialog over
// the plans — plan picker, payment method, what happens to the current plan,
// and one Proceed button that opens Razorpay. Replaces the old full-page
// order-summary step.
//
// It stacks on the full-screen billing overlay, which already owns Esc and
// the Tab trap with document-level listeners. This dialog listens on window
// in the capture phase and stops propagation, so Esc closes only this one
// and Tab stays inside it.

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TIER_LABEL } from "@/lib/plans/tiers";
import { formatMoney, type Currency } from "@/lib/currency-shared";
import { minorUnits, type DisplayPlan } from "@/lib/plans/display";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function planLabel(p: DisplayPlan): string {
  const tier = p.tier ? TIER_LABEL[p.tier] : p.name;
  return `${tier} · ${(p.intervalMonths ?? 1) > 1 ? "Yearly" : "Monthly"}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ConfirmPlanDialog({
  plan, plans, currency, hasActivePlan, subscriptionEndsAt, resumeFromPeriodEnd,
  loading, onChangePlan, onClose, onProceed,
}: {
  plan: DisplayPlan;
  /** Every subscription plan the picker can switch between. */
  plans: DisplayPlan[];
  currency: Currency;
  hasActivePlan: boolean;
  subscriptionEndsAt: string | null;
  resumeFromPeriodEnd: boolean;
  loading: boolean;
  onChangePlan: (plan: DisplayPlan) => void;
  onClose: () => void;
  onProceed: () => void;
}) {
  const titleId = useId();
  const selectId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("select")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      e.stopPropagation();
      const f = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus();
    };
  }, []);

  const price = formatMoney(minorUnits(plan, currency), currency);
  const yearly = (plan.intervalMonths ?? 1) > 1;
  const options = [...plans].sort(
    (a, b) => (a.intervalMonths ?? 1) - (b.intervalMonths ?? 1) || minorUnits(a, currency) - minorUnits(b, currency),
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[500px] rounded-2xl border border-line bg-surface-2 p-5 sm:p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-fg">{hasActivePlan ? "Change plan" : "Confirm your plan"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-fg-muted hover:text-fg transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Plan */}
        <div className="mt-5 flex items-baseline justify-between gap-3">
          <label htmlFor={selectId} className="text-sm text-fg-muted">Select a plan</label>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-fg underline underline-offset-2 hover:text-primary">
            Compare plans
          </button>
        </div>
        <div className="relative mt-2">
          <select
            id={selectId}
            value={plan.slug}
            onChange={(e) => {
              const next = plans.find((p) => p.slug === e.target.value);
              if (next) onChangePlan(next);
            }}
            className="h-11 w-full appearance-none rounded-xl border border-line-strong bg-surface-1 pl-3.5 pr-10 text-sm font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {options.map((p) => (
              <option key={p.slug} value={p.slug}>
                {planLabel(p)} — {formatMoney(minorUnits(p, currency), currency)}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        {/* What you get */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-sm">
          <span className="text-fg-muted">
            {plan.monthlyMinutes ? `${plan.monthlyMinutes.toLocaleString("en-IN")} Clip Minutes + ` : ""}
            {plan.monthlyCredits} AI credits / month
          </span>
          <span className="flex-shrink-0 whitespace-nowrap font-semibold text-fg">{price}<span className="font-normal text-fg-subtle">{yearly ? " / year" : " / month"}</span></span>
        </div>

        {/* Payment method */}
        <p className="mt-5 text-sm text-fg-muted">Payment method</p>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface-3 px-3.5 py-3">
          <span className="text-sm font-semibold text-fg">Razorpay</span>
          <span className="text-xs text-fg-muted">Cards · UPI · Netbanking · Wallets</span>
        </div>

        {/* What happens */}
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-fg-muted">
          {hasActivePlan && subscriptionEndsAt ? (
            resumeFromPeriodEnd ? (
              <p>
                You&apos;ve already paid through <span className="font-semibold text-fg">{fmtDate(subscriptionEndsAt)}</span>. This plan starts right
                after, so you aren&apos;t charged for time you already have.
              </p>
            ) : (
              <p>
                Buying now starts a <span className="font-semibold text-fg">new plan at full cost</span> today and{" "}
                <span className="font-semibold text-fg">resets</span> your subscription to {yearly ? "12 months" : "1 month"} from today. It
                doesn&apos;t extend your current plan (active until {fmtDate(subscriptionEndsAt)}).
              </p>
            )
          ) : (
            <p>
              Your plan starts today. You pay <span className="font-semibold text-fg">{price}</span> now for{" "}
              {yearly ? "12 months" : "1 month"}, and your new minutes and credits are added straight away.
            </p>
          )}
          <p>
            The plan renews automatically every {yearly ? "year" : "month"} at{" "}
            <span className="font-semibold text-fg">{price}</span> — cancel any time from Billing.
          </p>
          <p className="text-xs text-fg-subtle">
            Secure payment via Razorpay · 3-day money-back guarantee ·{" "}
            <Link href="/refund" className="underline hover:text-fg-muted">Refund Policy</Link> ·{" "}
            <Link href="/terms" className="underline hover:text-fg-muted">Terms</Link>
          </p>
        </div>

        <button
          type="button"
          onClick={onProceed}
          disabled={loading}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-fg text-[15px] font-semibold text-bg hover:bg-fg/90 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />Processing…</>
          ) : "Proceed"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
