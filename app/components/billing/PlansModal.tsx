"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { PURCHASABLE_TIER_ORDER } from "@/lib/plans/tiers";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";
import { PlanCard } from "@/app/components/billing/PlanCard";
import {
  minorUnits, yearlySavePct, type DisplayPlan,
} from "@/lib/plans/display";

// The plan shape and its price maths are shared with /pricing so the two
// surfaces cannot drift apart again — see lib/plans/display.ts.
type DbPlan = DisplayPlan;

const TERMS = [
  { months: 1, label: "Monthly" },
  { months: 12, label: "Yearly" },
];

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PlansModalProps {
  /** Called the moment a purchase is confirmed server-side. */
  onPurchaseSuccess: () => void;
}

// "Browse all plans + top-ups", rendered as one of BillingOverlay's views so
// users never leave whatever they were doing to subscribe or upgrade. The plan
// cards themselves come from components/billing/PlanCard, shared with /pricing.
// Purchase logic (useRazorpayCheckout, /api/billing/checkout,
// /api/billing/verify, /api/coupons/validate) is reused as-is, not
// reimplemented.
export function PlansModal({ onPurchaseSuccess }: PlansModalProps) {
  const { user, token } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [term, setTerm] = useState(1);
  const [currency, setCurrency] = useState<Currency>("INR");
  useEffect(() => {
    setCurrency(inferCurrencyFromLocale(typeof navigator !== "undefined" ? navigator.language : null));
  }, []);

  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);

  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; discountInPaise: number } | null>(null);

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const subs = plans.filter(p => p.kind === "subscription");
  const packs = plans.filter(p => p.kind === "pack");

  const hasActivePlan = !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();
  const checkoutLoading = checkoutPlan != null && activeId === checkoutPlan.slug;

  function toggleAddon(slug: string) {
    setSelectedAddons(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]));
    setAppliedCoupon(null);
    setCouponError("");
  }

  function openCheckout(plan: DbPlan) {
    setCheckoutPlan(plan);
    setRenewalWarningDismissed(false);
    setCouponInput("");
    setCouponError("");
    setAppliedCoupon(null);
  }

  // Coupons are INR-native (validated/discounted against the stored
  // priceInPaise) — hide the coupon UI on USD checkout instead of showing a
  // code that silently does nothing server-side.
  const couponsAvailable = currency === "INR";

  function backToBrowse() {
    setCheckoutPlan(null);
  }

  function clearCoupon() {
    setAppliedCoupon(null);
    setCouponError("");
  }

  async function applyCoupon() {
    if (!checkoutPlan || !couponInput.trim()) return;
    setCouponApplying(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: checkoutPlan.slug, addonIds: selectedAddons, code: couponInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAppliedCoupon(null);
        setCouponError(data.error ?? "Could not apply coupon.");
        return;
      }
      setAppliedCoupon({ code: data.code, label: data.label, discountInPaise: data.discountInPaise });
    } catch {
      setCouponError("Could not apply coupon. Try again.");
    } finally {
      setCouponApplying(false);
    }
  }

  function handlePay() {
    if (!checkoutPlan) return;
    startCheckout({
      planId: checkoutPlan.slug,
      addonIds: selectedAddons,
      // Coupons are INR-native and the server REJECTS a code sent with USD, so
      // a coupon applied in rupees and then left over after a currency switch
      // hard-failed checkout — with the coupon UI hidden on USD, the customer
      // had no way to remove it.
      couponCode: couponsAvailable ? appliedCoupon?.code : undefined,
      currency,
      onSuccess: () => {
        onPurchaseSuccess();
      },
    });
  }

  const totalDueMinor =
    (checkoutPlan ? minorUnits(checkoutPlan, currency) : 0) +
    selectedAddons.reduce((s, slug) => {
      const pack = packs.find(p => p.slug === slug);
      return s + (pack ? minorUnits(pack, currency) : 0);
    }, 0);
  // discountInPaise is exactly that — paise. Subtracting it from a USD cents
  // total showed a ~88x over-discount before the server refused the order.
  const discountedTotalMinor = appliedCoupon && couponsAvailable
    ? Math.max(1, totalDueMinor - appliedCoupon.discountInPaise)
    : totalDueMinor;

  // Renders bare — BillingOverlay supplies the dialog, backdrop and close
  // button. This used to be a hand-rolled `fixed inset-0` overlay with no focus
  // trap, ESC handling or portal; folding it into the shared overlay means it
  // inherits all three.
  return (
    <div className="flex flex-col min-h-0">
        {checkoutPlan ? (
          <CheckoutStep
            plan={checkoutPlan}
            packs={packs}
            currency={currency}
            selectedAddons={selectedAddons}
            onToggleAddon={toggleAddon}
            onBack={backToBrowse}
            hasActivePlan={hasActivePlan}
            subscriptionEndsAt={user?.subscriptionEndsAt ?? null}
            renewalWarningDismissed={renewalWarningDismissed}
            onDismissRenewalWarning={() => setRenewalWarningDismissed(true)}
            couponsAvailable={couponsAvailable}
            couponInput={couponInput}
            onCouponInputChange={(v) => { setCouponInput(v.toUpperCase()); setCouponError(""); }}
            couponApplying={couponApplying}
            couponError={couponError}
            appliedCoupon={appliedCoupon}
            onApplyCoupon={applyCoupon}
            onClearCoupon={clearCoupon}
            totalDueMinor={totalDueMinor}
            discountedTotalMinor={discountedTotalMinor}
            checkoutLoading={checkoutLoading}
            onPay={handlePay}
          />
        ) : (
          <BrowseStep
            plansLoading={plansLoading}
            subs={subs}
            packs={packs}
            term={term}
            onTermChange={setTerm}
            currency={currency}
            // Switching currency invalidates any applied coupon: the discount is
            // INR paise and the coupon UI is hidden on USD, so leaving it applied
            // strands the customer with a total they can't correct.
            onCurrencyChange={(c) => { setCurrency(c); clearCoupon(); }}
            selectedAddons={selectedAddons}
            onToggleAddon={toggleAddon}
            onSelectPlan={openCheckout}
            currentPlanSlug={user?.plan?.slug ?? null}
          />
        )}
    </div>
  );
}

// ── Browse step ──────────────────────────────────────────────────────────────
function BrowseStep({ plansLoading, subs, packs, term, onTermChange, currency, onCurrencyChange, selectedAddons, onToggleAddon, onSelectPlan, currentPlanSlug }: {
  plansLoading: boolean;
  subs: DbPlan[];
  packs: DbPlan[];
  term: number;
  onTermChange: (months: number) => void;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  selectedAddons: string[];
  onToggleAddon: (slug: string) => void;
  onSelectPlan: (plan: DbPlan) => void;
  currentPlanSlug: string | null;
}) {
  const cards = PURCHASABLE_TIER_ORDER
    .map(tier => subs.find(p => p.tier === tier && p.intervalMonths === term))
    .filter((p): p is DbPlan => !!p);
  // Derived from the real plan rows, not a hardcoded constant — prices are
  // editable at runtime in /admin/pricing.
  const savePct = yearlySavePct(subs, currency);

  return (
    <div className="overflow-y-auto flex-1 min-h-0 p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-extrabold text-fg">Plans &amp; top-ups</h2>
        <p className="text-sm text-fg-muted mt-1">Every AI tool, one credit at a time.</p>
      </div>

      <div className="flex justify-center items-center gap-3 mb-8 flex-wrap">
        <div className="inline-flex bg-surface-3 rounded-full p-1">
          {TERMS.map(t => (
            <button
              key={t.months}
              onClick={() => onTermChange(t.months)}
              className={`relative px-5 sm:px-7 py-2 rounded-full text-sm font-semibold transition-all ${
                term === t.months ? "bg-brand text-on-primary shadow" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
              {t.months === 12 && savePct != null && (
                <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  term === 12 ? "bg-green-400 text-green-900" : "bg-green-100 text-green-700"
                }`}>
                  SAVE {savePct}%
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="inline-flex bg-surface-3 rounded-full p-1">
          {(["INR", "USD"] as const).map(c => (
            <button
              key={c}
              onClick={() => onCurrencyChange(c)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                currency === c ? "bg-fg text-bg shadow" : "text-fg-muted hover:text-fg"
              }`}
            >
              {c === "INR" ? "₹ INR" : "$ USD"}
            </button>
          ))}
        </div>
      </div>

      {plansLoading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[0, 1, 2].map(i => <div key={i} className="rounded-2xl border-2 border-line bg-panel animate-pulse h-80" />)}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-center text-fg-subtle text-sm py-12">Pricing is being updated. Please check back shortly.</p>
      ) : (
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {cards.map((plan, idx) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              subs={subs}
              currency={currency}
              highlighted={idx === 1}
              isCurrent={currentPlanSlug === plan.slug}
              onSelect={onSelectPlan}
              size="compact"
            />
          ))}
        </div>
      )}

      {!plansLoading && packs.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-surface-3" />
            <p className="text-xs font-bold text-fg-subtle uppercase tracking-widest whitespace-nowrap">Top-up credit packs</p>
            <div className="h-px flex-1 bg-surface-3" />
          </div>
          <p className="text-center text-xs text-fg-subtle mb-4">Select any packs to bundle with a plan at checkout.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {packs.map(pack => {
              const checked = selectedAddons.includes(pack.slug);
              return (
                <label
                  key={pack.id}
                  className={`flex items-start gap-3 p-4 bg-panel rounded-xl border-2 cursor-pointer transition-all ${
                    checked ? "border-brand shadow-sm bg-tint-blue/20" : "border-line hover:border-line"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleAddon(pack.slug)}
                    className="mt-0.5 w-4 h-4 accent-[color:var(--brand)] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fg text-sm">{pack.name}</p>
                    <p className="text-xs text-fg-muted mt-0.5">{pack.credits} credits</p>
                    <p className="font-bold text-fg mt-1.5">{formatMoney(minorUnits(pack, currency), currency)}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Checkout step ────────────────────────────────────────────────────────────
function CheckoutStep({
  plan, packs, currency, selectedAddons, onToggleAddon, onBack, hasActivePlan, subscriptionEndsAt,
  renewalWarningDismissed, onDismissRenewalWarning, couponsAvailable, couponInput, onCouponInputChange,
  couponApplying, couponError, appliedCoupon, onApplyCoupon, onClearCoupon,
  totalDueMinor, discountedTotalMinor, checkoutLoading, onPay,
}: {
  plan: DbPlan;
  packs: DbPlan[];
  currency: Currency;
  selectedAddons: string[];
  onToggleAddon: (slug: string) => void;
  onBack: () => void;
  hasActivePlan: boolean;
  subscriptionEndsAt: string | null;
  renewalWarningDismissed: boolean;
  onDismissRenewalWarning: () => void;
  couponsAvailable: boolean;
  couponInput: string;
  onCouponInputChange: (v: string) => void;
  couponApplying: boolean;
  couponError: string;
  appliedCoupon: { code: string; label: string; discountInPaise: number } | null;
  onApplyCoupon: () => void;
  onClearCoupon: () => void;
  totalDueMinor: number;
  discountedTotalMinor: number;
  checkoutLoading: boolean;
  onPay: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row overflow-y-auto flex-1 min-h-0">
      <div className="flex-1 p-8 bg-surface-2 overflow-y-auto">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg mb-5 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to plans
        </button>

        <div className="mb-6 p-4 bg-panel rounded-xl border border-line shadow-sm">
          <p className="text-xs font-bold text-fg-subtle uppercase tracking-widest mb-1">Selected Plan</p>
          <p className="font-extrabold text-fg text-lg leading-snug">{plan.name}</p>
          <p className="text-sm text-fg-muted mt-0.5">{plan.monthlyCredits} credits / month</p>
          <p className="text-2xl font-black text-fg mt-2">
            {formatMoney(minorUnits(plan, currency), currency)}
            <span className="text-sm font-normal text-fg-subtle ml-1">
              {plan.intervalMonths && plan.intervalMonths > 1 ? `/ ${plan.intervalMonths} months` : "/ month"}
            </span>
          </p>
        </div>

        {hasActivePlan && !renewalWarningDismissed && subscriptionEndsAt && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-warning flex-shrink-0 mt-0.5">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">You already have an active plan</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Buying now will <strong>reset</strong> your subscription to {plan.intervalMonths && plan.intervalMonths > 1 ? `${plan.intervalMonths} months` : "1 month"} from today — not extend your current plan (active until {new Date(subscriptionEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).
              </p>
            </div>
            <button onClick={onDismissRenewalWarning} className="text-warning hover:text-amber-700 flex-shrink-0 ml-1">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {packs.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-surface-3" />
              <p className="text-xs font-bold text-fg-subtle uppercase tracking-widest whitespace-nowrap">Bundle Add-ons</p>
              <div className="h-px flex-1 bg-surface-3" />
            </div>
            <div className="space-y-3">
              {packs.map(pack => {
                const checked = selectedAddons.includes(pack.slug);
                return (
                  <label
                    key={pack.id}
                    className={`flex items-start gap-3 p-4 bg-panel rounded-xl border-2 cursor-pointer transition-all ${
                      checked ? "border-brand shadow-sm bg-tint-blue/20" : "border-line hover:border-line"
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggleAddon(pack.slug)} className="mt-0.5 w-4 h-4 accent-[color:var(--brand)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fg text-sm">{pack.name}</p>
                      <p className="text-xs text-fg-muted mt-0.5">{pack.credits} credits · never expire</p>
                    </div>
                    <p className="font-bold text-fg whitespace-nowrap">{formatMoney(minorUnits(pack, currency), currency)}</p>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="w-full md:w-72 p-8 flex flex-col border-t md:border-t-0 md:border-l border-line flex-shrink-0">
        <h3 className="font-bold text-fg text-lg mb-5">Order Summary</h3>
        <div className="flex-1 space-y-4 min-h-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg truncate">{plan.name}</p>
              <p className="text-xs text-fg-subtle">Subscription plan</p>
            </div>
            <p className="text-sm font-semibold text-fg whitespace-nowrap">{formatMoney(minorUnits(plan, currency), currency)}</p>
          </div>

          {selectedAddons.map(slug => {
            const pack = packs.find(p => p.slug === slug);
            if (!pack) return null;
            return (
              <div key={slug} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{pack.name}</p>
                  <p className="text-xs text-fg-subtle">{pack.credits} credits · add-on</p>
                </div>
                <p className="text-sm font-semibold text-fg whitespace-nowrap">{formatMoney(minorUnits(pack, currency), currency)}</p>
              </div>
            );
          })}

          {couponsAvailable && (
          <div className="border-t border-line pt-4">
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-green-700 truncate">🎟 {appliedCoupon.code} applied</p>
                  <p className="text-[11px] text-success">{appliedCoupon.label}</p>
                </div>
                <button onClick={onClearCoupon} className="text-xs text-green-700 hover:text-green-900 underline flex-shrink-0">Remove</button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={e => onCouponInputChange(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onApplyCoupon(); } }}
                    placeholder="Coupon code"
                    className="flex-1 min-w-0 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm font-semibold tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  <button
                    onClick={onApplyCoupon}
                    disabled={couponApplying || !couponInput.trim()}
                    className="px-3 py-2 rounded-lg bg-fg text-bg text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {couponApplying ? "…" : "Apply"}
                  </button>
                </div>
                {couponError && <p className="text-xs text-error mt-1.5">{couponError}</p>}
              </div>
            )}
          </div>
          )}

          <div className="border-t border-line pt-4 mt-2">
            {appliedCoupon && appliedCoupon.discountInPaise > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">Subtotal</span>
                  <span className="text-fg-muted">{formatMoney(totalDueMinor, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-success font-medium">Discount ({appliedCoupon.code})</span>
                  <span className="text-success font-medium">−{formatMoney(appliedCoupon.discountInPaise, currency)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between mt-2">
              <p className="font-bold text-fg">Total Due</p>
              <p className="text-xl font-black text-fg">{formatMoney(discountedTotalMinor, currency)}</p>
            </div>
            <p className="text-xs text-fg-subtle mt-1">Secure payment via Razorpay</p>
          </div>
        </div>

        <button
          onClick={onPay}
          disabled={checkoutLoading}
          className="mt-6 w-full bg-brand text-on-primary font-bold py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
        >
          {checkoutLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : "Pay with Razorpay →"}
        </button>
        <p className="text-xs text-fg-subtle text-center mt-3">
          By continuing, you agree to our <Link href="/terms" className="underline hover:text-fg-muted">Terms of Service</Link>
        </p>
        <p className="text-xs text-fg-subtle text-center mt-1">
          3-day money-back guarantee · <Link href="/refund" className="underline hover:text-fg-muted">Refund Policy</Link>
        </p>
      </div>
    </div>
  );
}
