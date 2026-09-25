"use client";

// Plan checkout: selected plan + optional add-on packs on the left, order
// summary, coupon and pay on the right. Presentation only — all state and the
// Razorpay/coupon calls stay in the page, which owns the cart.

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

export interface AppliedCoupon { code: string; label: string; discountInPaise: number }

export function CheckoutModal(props: {
  plan: DbPlan;
  trial: boolean;
  currency: Currency;
  packs: DbPlan[];
  selectedAddons: string[];
  onToggleAddon: (slug: string) => void;
  /** Shown when the buyer already has a running plan that this purchase resets. */
  activePlanEndsAt: string | null;
  couponsAvailable: boolean;
  couponInput: string;
  onCouponInput: (v: string) => void;
  couponApplying: boolean;
  couponError: string;
  appliedCoupon: AppliedCoupon | null;
  onApplyCoupon: () => void;
  onClearCoupon: () => void;
  totalDueMinor: number;
  discountedTotalMinor: number;
  loading: boolean;
  error: string;
  onPay: () => void;
  onClose: () => void;
}) {
  const {
    plan, trial, currency, packs, selectedAddons, onToggleAddon, activePlanEndsAt,
    couponsAvailable, couponInput, onCouponInput, couponApplying, couponError, appliedCoupon,
    onApplyCoupon, onClearCoupon, totalDueMinor, discountedTotalMinor, loading, error, onPay, onClose,
  } = props;
  const months = plan.intervalMonths ?? 1;
  const termLabel = months > 1 ? `${months} months` : "1 month";
  const dueNow = trial ? 0 : discountedTotalMinor;

  return (
    <NextIntlClientProvider locale="en" messages={COMMON_MESSAGES}>
      <Modal open onClose={() => { if (!loading) onClose(); }} title="Checkout" maxWidth="max-w-3xl">
        {/* Negative margin cancels Modal's own p-5 so the two panes run edge to
            edge; overflow-hidden keeps the tinted left pane inside the corners. */}
        <div className="-m-5 flex min-h-0 flex-1 flex-col overflow-hidden overflow-y-auto rounded-b-[var(--radius-card)] md:flex-row">

          {/* LEFT: plan + add-ons */}
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
                {formatMoney(minorUnits(plan, currency), currency)}
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

            {packs.length > 0 && (
              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-2.5 text-sm font-semibold text-fg">
                  Add credits <span className="font-normal text-fg-subtle">· optional, never expire</span>
                </legend>
                {packs.map(pack => {
                  const checked = selectedAddons.includes(pack.slug);
                  return (
                    <label
                      key={pack.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
                        checked ? "border-primary bg-surface-3" : "border-line bg-surface-2 hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleAddon(pack.slug)}
                        className="h-[18px] w-[18px] flex-shrink-0 accent-[color:var(--primary)]"
                      />
                      <span className="min-w-0 flex-1 text-sm text-fg">
                        {pack.name} <span className="text-fg-subtle">· {pack.credits} credits</span>
                      </span>
                      <span className="whitespace-nowrap text-sm font-semibold text-fg">
                        {formatMoney(minorUnits(pack, currency), currency)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </div>

          {/* RIGHT: order summary */}
          <div className="flex w-full flex-shrink-0 flex-col gap-4 border-t border-line p-6 sm:p-7 md:w-[300px] md:border-l md:border-t-0">
            <h3 className="text-[15px] font-semibold text-fg">Order summary</h3>

            <div className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg-muted">{plan.name}</span>
              <span className="whitespace-nowrap text-fg">{formatMoney(minorUnits(plan, currency), currency)}</span>
            </div>
            {selectedAddons.map(slug => {
              const pack = packs.find(p => p.slug === slug);
              if (!pack) return null;
              return (
                <div key={slug} className="flex items-start justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-fg-muted">{pack.name}</span>
                  <span className="whitespace-nowrap text-fg">{formatMoney(minorUnits(pack, currency), currency)}</span>
                </div>
              );
            })}

            {/* Coupons are INR-native (validated against priceInPaise), so the
                field is hidden on USD rather than silently doing nothing. */}
            {couponsAvailable && (
              <div className="border-t border-line pt-4">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-tint-emerald-border bg-tint-emerald px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-success">{appliedCoupon.code} applied</p>
                      <p className="text-[11px] text-success">{appliedCoupon.label}</p>
                    </div>
                    <button type="button" onClick={onClearCoupon} className="flex-shrink-0 text-xs text-success underline hover:text-fg">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="coupon" className="text-xs text-fg-muted">Coupon code</label>
                    <div className="flex gap-2">
                      <input
                        id="coupon"
                        value={couponInput}
                        onChange={e => onCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onApplyCoupon(); } }}
                        placeholder="CODE"
                        className="h-11 min-w-0 flex-1 rounded-[var(--radius-field)] border border-line-strong bg-bg px-3 text-sm font-semibold uppercase tracking-wide text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={onApplyCoupon}
                        disabled={couponApplying || !couponInput.trim()}
                        className="h-11 rounded-[var(--radius-field)] bg-surface-3 px-3.5 text-sm font-semibold text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-raised disabled:opacity-40"
                      >
                        {couponApplying ? "…" : "Apply"}
                      </button>
                    </div>
                    {couponError && <p className="text-xs text-error">{couponError}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-line pt-4">
              {couponsAvailable && appliedCoupon && appliedCoupon.discountInPaise > 0 && (
                <>
                  <div className="flex justify-between text-sm text-fg-muted">
                    <span>Subtotal</span><span>{formatMoney(totalDueMinor, currency)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm font-medium text-success">
                    <span>Discount ({appliedCoupon.code})</span><span>−{formatMoney(appliedCoupon.discountInPaise, currency)}</span>
                  </div>
                </>
              )}
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-semibold text-fg">{trial ? "Due today" : "Total due"}</span>
                <span className="text-2xl font-semibold text-fg">{formatMoney(dueNow, currency)}</span>
              </div>
              {trial && (
                <p className="mt-1.5 text-xs text-fg-muted">
                  Free for 7 days, then {formatMoney(discountedTotalMinor, currency)}. Cancel any time before it ends.
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
              Secure payment via Razorpay · 48-hour money-back
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
