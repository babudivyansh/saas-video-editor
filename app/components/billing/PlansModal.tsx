"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { PURCHASABLE_TIER_ORDER, TIER_LABEL } from "@/lib/plans/tiers";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";

interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  usdPriceInCents: number;
  currency: string;
  credits: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths: number | null;
  monthlyCredits: number | null;
  tier: "creator" | "pro" | "studio" | null;
}

/** Minor units for the selected currency, from the fields /api/plans always returns. */
function minorUnits(plan: DbPlan, currency: Currency): number {
  return currency === "USD" ? plan.usdPriceInCents : plan.priceInPaise;
}

const TERMS = [
  { months: 1, label: "Monthly" },
  { months: 12, label: "Yearly" },
];
const YEARLY_SAVE_PCT = 33;

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PlansModalProps {
  onClose: () => void;
  /** Called the moment a purchase is confirmed server-side — before the modal closes. */
  onPurchaseSuccess: () => void;
}

// Self-contained "browse all plans + top-ups" overlay reachable from /billing,
// so users never have to leave the billing page to subscribe or upgrade.
// Deliberately not shared with /pricing (a much larger marketing page with a
// credit calculator, comparison table, and FAQ this modal has no need for) —
// this duplicates the plan-card/checkout-modal JSX from /pricing rather than
// extracting a shared component, an explicit scope trade-off. Purchase logic
// itself (useRazorpayCheckout, /api/billing/checkout, /api/billing/verify,
// /api/coupons/validate) is reused as-is, not reimplemented.
export function PlansModal({ onClose, onPurchaseSuccess }: PlansModalProps) {
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
      couponCode: appliedCoupon?.code,
      currency,
      onSuccess: () => {
        onPurchaseSuccess();
        onClose();
      },
    });
  }

  function handleClose() {
    if (checkoutLoading) return;
    onClose();
  }

  const totalDueMinor =
    (checkoutPlan ? minorUnits(checkoutPlan, currency) : 0) +
    selectedAddons.reduce((s, slug) => {
      const pack = packs.find(p => p.slug === slug);
      return s + (pack ? minorUnits(pack, currency) : 0);
    }, 0);
  const discountedTotalMinor = appliedCoupon
    ? Math.max(1, totalDueMinor - appliedCoupon.discountInPaise)
    : totalDueMinor;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Plans and top-ups">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <button
          onClick={handleClose}
          disabled={checkoutLoading}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-40"
          aria-label="Close"
        >
          <XIcon className="w-5 h-5" />
        </button>

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
            onCurrencyChange={setCurrency}
            selectedAddons={selectedAddons}
            onToggleAddon={toggleAddon}
            onSelectPlan={openCheckout}
          />
        )}
      </div>
    </div>
  );
}

// ── Browse step ──────────────────────────────────────────────────────────────
function BrowseStep({ plansLoading, subs, packs, term, onTermChange, currency, onCurrencyChange, selectedAddons, onToggleAddon, onSelectPlan }: {
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
}) {
  const cards = PURCHASABLE_TIER_ORDER
    .map(tier => subs.find(p => p.tier === tier && p.intervalMonths === term))
    .filter((p): p is DbPlan => !!p);

  return (
    <div className="overflow-y-auto flex-1 min-h-0 p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-extrabold text-gray-900">Plans &amp; top-ups</h2>
        <p className="text-sm text-gray-500 mt-1">Every AI tool, one credit at a time.</p>
      </div>

      <div className="flex justify-center items-center gap-3 mb-8 flex-wrap">
        <div className="inline-flex bg-gray-100 rounded-full p-1">
          {TERMS.map(t => (
            <button
              key={t.months}
              onClick={() => onTermChange(t.months)}
              className={`relative px-5 sm:px-7 py-2 rounded-full text-sm font-semibold transition-all ${
                term === t.months ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
              {t.months === 12 && (
                <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  term === 12 ? "bg-green-400 text-green-900" : "bg-green-100 text-green-700"
                }`}>
                  SAVE {YEARLY_SAVE_PCT}%
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="inline-flex bg-gray-100 rounded-full p-1">
          {(["INR", "USD"] as const).map(c => (
            <button
              key={c}
              onClick={() => onCurrencyChange(c)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                currency === c ? "bg-gray-900 text-white shadow" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {c === "INR" ? "₹ INR" : "$ USD"}
            </button>
          ))}
        </div>
      </div>

      {plansLoading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[0, 1, 2].map(i => <div key={i} className="rounded-2xl border-2 border-gray-100 bg-white animate-pulse h-80" />)}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-12">Pricing is being updated. Please check back shortly.</p>
      ) : (
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {cards.map((plan, idx) => {
            const highlighted = idx === 1;
            const priceMinor = minorUnits(plan, currency);
            const months = plan.intervalMonths ?? 1;
            const perMonthMinor = Math.round(priceMinor / months);
            const baseTier = plan.tier ? TIER_LABEL[plan.tier] : plan.name;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 border-2 flex flex-col ${
                  highlighted ? "border-blue-600 bg-blue-600 text-white shadow-xl" : "border-gray-100 bg-white text-gray-900 shadow-sm"
                }`}
              >
                {highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-green-400 text-green-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide">
                      Most Popular
                    </span>
                  </div>
                )}
                <p className={`text-sm font-bold uppercase tracking-widest mb-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                  {baseTier}
                </p>
                <div className="flex items-end gap-1.5 mb-1">
                  <span className="text-3xl font-black">{formatMoney(perMonthMinor, currency)}</span>
                  <span className={`text-sm mb-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>/mo</span>
                </div>
                <p className={`text-sm mb-4 ${highlighted ? "text-blue-100" : "text-gray-500"}`}>
                  {plan.monthlyCredits} credits / month
                  {months > 1 && <> · {formatMoney(priceMinor, currency)} billed yearly</>}
                </p>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.slice(0, 5).map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? "text-blue-200" : "text-blue-600"}`} />
                      <span className={highlighted ? "text-blue-100" : "text-gray-700"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onSelectPlan(plan)}
                  className={`w-full font-bold py-3 rounded-full transition-all ${
                    highlighted ? "bg-white text-blue-600 hover:bg-blue-50" : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Get {baseTier}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!plansLoading && packs.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-gray-200" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Top-up credit packs</p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="text-center text-xs text-gray-400 mb-4">Select any packs to bundle with a plan at checkout.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {packs.map(pack => {
              const checked = selectedAddons.includes(pack.slug);
              return (
                <label
                  key={pack.id}
                  className={`flex items-start gap-3 p-4 bg-white rounded-xl border-2 cursor-pointer transition-all ${
                    checked ? "border-blue-600 shadow-sm bg-blue-50/20" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleAddon(pack.slug)}
                    className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{pack.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{pack.credits} credits</p>
                    <p className="font-bold text-gray-900 mt-1.5">{formatMoney(minorUnits(pack, currency), currency)}</p>
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
      <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 mb-5 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to plans
        </button>

        <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Selected Plan</p>
          <p className="font-extrabold text-gray-900 text-lg leading-snug">{plan.name}</p>
          <p className="text-sm text-gray-500 mt-0.5">{plan.monthlyCredits} credits / month</p>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {formatMoney(minorUnits(plan, currency), currency)}
            <span className="text-sm font-normal text-gray-400 ml-1">
              {plan.intervalMonths && plan.intervalMonths > 1 ? `/ ${plan.intervalMonths} months` : "/ month"}
            </span>
          </p>
        </div>

        {hasActivePlan && !renewalWarningDismissed && subscriptionEndsAt && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">You already have an active plan</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Buying now will <strong>reset</strong> your subscription to {plan.intervalMonths && plan.intervalMonths > 1 ? `${plan.intervalMonths} months` : "1 month"} from today — not extend your current plan (active until {new Date(subscriptionEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).
              </p>
            </div>
            <button onClick={onDismissRenewalWarning} className="text-amber-500 hover:text-amber-700 flex-shrink-0 ml-1">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {packs.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Bundle Add-ons</p>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="space-y-3">
              {packs.map(pack => {
                const checked = selectedAddons.includes(pack.slug);
                return (
                  <label
                    key={pack.id}
                    className={`flex items-start gap-3 p-4 bg-white rounded-xl border-2 cursor-pointer transition-all ${
                      checked ? "border-blue-600 shadow-sm bg-blue-50/20" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggleAddon(pack.slug)} className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{pack.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{pack.credits} credits · never expire</p>
                    </div>
                    <p className="font-bold text-gray-900 whitespace-nowrap">{formatMoney(minorUnits(pack, currency), currency)}</p>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="w-full md:w-72 p-8 flex flex-col border-t md:border-t-0 md:border-l border-gray-100 flex-shrink-0">
        <h3 className="font-bold text-gray-900 text-lg mb-5">Order Summary</h3>
        <div className="flex-1 space-y-4 min-h-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{plan.name}</p>
              <p className="text-xs text-gray-400">Subscription plan</p>
            </div>
            <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatMoney(minorUnits(plan, currency), currency)}</p>
          </div>

          {selectedAddons.map(slug => {
            const pack = packs.find(p => p.slug === slug);
            if (!pack) return null;
            return (
              <div key={slug} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{pack.name}</p>
                  <p className="text-xs text-gray-400">{pack.credits} credits · add-on</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatMoney(minorUnits(pack, currency), currency)}</p>
              </div>
            );
          })}

          {couponsAvailable && (
          <div className="border-t border-gray-100 pt-4">
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-green-700 truncate">🎟 {appliedCoupon.code} applied</p>
                  <p className="text-[11px] text-green-600">{appliedCoupon.label}</p>
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
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={onApplyCoupon}
                    disabled={couponApplying || !couponInput.trim()}
                    className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {couponApplying ? "…" : "Apply"}
                  </button>
                </div>
                {couponError && <p className="text-xs text-red-600 mt-1.5">{couponError}</p>}
              </div>
            )}
          </div>
          )}

          <div className="border-t border-gray-100 pt-4 mt-2">
            {appliedCoupon && appliedCoupon.discountInPaise > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-500">{formatMoney(totalDueMinor, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-green-600 font-medium">Discount ({appliedCoupon.code})</span>
                  <span className="text-green-600 font-medium">−{formatMoney(appliedCoupon.discountInPaise, currency)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between mt-2">
              <p className="font-bold text-gray-900">Total Due</p>
              <p className="text-xl font-black text-gray-900">{formatMoney(discountedTotalMinor, currency)}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">Secure payment via Razorpay</p>
          </div>
        </div>

        <button
          onClick={onPay}
          disabled={checkoutLoading}
          className="mt-6 w-full bg-blue-600 text-white font-bold py-3.5 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
        >
          {checkoutLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : "Pay with Razorpay →"}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          By continuing, you agree to our <Link href="/terms" className="underline hover:text-gray-600">Terms of Service</Link>
        </p>
        <p className="text-xs text-gray-400 text-center mt-1">
          3-day money-back guarantee · <Link href="/refund" className="underline hover:text-gray-600">Refund Policy</Link>
        </p>
      </div>
    </div>
  );
}
