"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { PURCHASABLE_TIER_ORDER } from "@/lib/plans/tiers";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";
import { PlanCard } from "@/app/components/billing/PlanCard";
import { ConfirmPlanDialog } from "@/app/components/billing/ConfirmPlanDialog";
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

interface PlansModalProps {
  /** Called the moment a purchase is confirmed server-side. */
  onPurchaseSuccess: () => void;
  /** Set only when opened from the billing dunning banner (a failed-payment
   *  retry, not a normal upgrade/switch). The plan bought here starts at the
   *  current period's end instead of today, since the customer already paid
   *  for time still remaining — see /api/billing/checkout. */
  resumeFromPeriodEnd?: boolean;
}

// "Browse all plans + top-ups", rendered as one of BillingOverlay's views so
// users never leave whatever they were doing to subscribe or upgrade. The plan
// cards themselves come from components/billing/PlanCard, shared with /pricing.
// Purchase logic (useRazorpayCheckout, /api/billing/checkout,
// /api/billing/verify) is reused as-is, not reimplemented.
//
// A subscription checkout is exactly its plan. This modal used to bundle
// add-on packs and take a coupon at plan checkout, but a subscription is billed
// at its synced Razorpay plan amount, so neither was ever charged or applied.
// Packs now have their own Buy buttons (2026-09-25).
export function PlansModal({ onPurchaseSuccess, resumeFromPeriodEnd = false }: PlansModalProps) {
  const { user } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [term, setTerm] = useState(1);
  const [currency, setCurrency] = useState<Currency>("INR");
  useEffect(() => {
    setCurrency(inferCurrencyFromLocale(typeof navigator !== "undefined" ? navigator.language : null));
  }, []);

  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const subs = plans.filter(p => p.kind === "subscription");
  const packs = plans.filter(p => p.kind === "pack");
  const minutePacks = plans.filter(p => p.kind === "minute_pack");

  const hasActivePlan = !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();
  const checkoutLoading = checkoutPlan != null && activeId === checkoutPlan.slug;

  function openCheckout(plan: DbPlan) {
    setCheckoutPlan(plan);
  }

  function backToBrowse() {
    setCheckoutPlan(null);
  }

  function handlePay() {
    if (!checkoutPlan) return;
    startCheckout({
      planId: checkoutPlan.slug,
      currency,
      resumeFromPeriodEnd,
      onSuccess: () => {
        onPurchaseSuccess();
      },
    });
  }

  // A credit pack is its own one-time purchase — no plan required.
  function handleBuyPack(pack: DbPlan) {
    startCheckout({ planId: pack.slug, currency, onSuccess: () => { onPurchaseSuccess(); } });
  }

  // Renders bare — BillingOverlay supplies the dialog, backdrop and close
  // button. This used to be a hand-rolled `fixed inset-0` overlay with no focus
  // trap, ESC handling or portal; folding it into the shared overlay means it
  // inherits all three.
  return (
    <div className="flex flex-col min-h-0">
        {/* Picking a plan opens a compact confirm dialog over the plans,
            rather than swapping the page for an order summary. */}
        {checkoutPlan && (
          <ConfirmPlanDialog
            plan={checkoutPlan}
            plans={subs}
            currency={currency}
            hasActivePlan={hasActivePlan}
            subscriptionEndsAt={user?.subscriptionEndsAt ?? null}
            resumeFromPeriodEnd={resumeFromPeriodEnd}
            loading={checkoutLoading}
            onChangePlan={setCheckoutPlan}
            onClose={backToBrowse}
            onProceed={handlePay}
          />
        )}
          <BrowseStep
            plansLoading={plansLoading}
            subs={subs}
            packs={packs}
            minutePacks={minutePacks}
            term={term}
            onTermChange={setTerm}
            currency={currency}
            onCurrencyChange={setCurrency}
            buyingPack={activeId}
            onBuyPack={handleBuyPack}
            onSelectPlan={openCheckout}
            currentPlanSlug={user?.plan?.slug ?? null}
          />
    </div>
  );
}

// ── Browse step ──────────────────────────────────────────────────────────────
function BrowseStep({ plansLoading, subs, packs, minutePacks, term, onTermChange, currency, onCurrencyChange, buyingPack, onBuyPack, onSelectPlan, currentPlanSlug }: {
  plansLoading: boolean;
  subs: DbPlan[];
  packs: DbPlan[];
  minutePacks: DbPlan[];
  term: number;
  onTermChange: (months: number) => void;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  buyingPack: string | null;
  onBuyPack: (pack: DbPlan) => void;
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
    // The overlay renders this full screen under its "Upgrade your plan"
    // heading, so the page supplies no title of its own.
    <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-8 pt-6 pb-16">
      <div className="flex justify-center items-center gap-3 mb-10 flex-wrap">
        <div className="inline-flex rounded-full border border-line bg-surface-2 p-1" role="group" aria-label="Billing period">
          {TERMS.map(t => (
            <button
              key={t.months}
              onClick={() => onTermChange(t.months)}
              aria-pressed={term === t.months}
              className={`relative px-5 sm:px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                term === t.months ? "bg-surface-3 text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
              {t.months === 12 && savePct != null && (
                <span className="ml-1.5 font-semibold text-success">(save {savePct}%)</span>
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
              look="upgrade"
            />
          ))}
        </div>
      )}

      {!plansLoading && (
        <PackGrid
          title="Clip Minute packs"
          blurb="For Auto Clips — 1 minute per minute of video. Pack minutes never expire."
          packs={minutePacks}
          amount={(p) => `${p.minutes ?? 0} Clip Minutes`}
          currency={currency}
          buyingPack={buyingPack}
          onBuyPack={onBuyPack}
        />
      )}
      {!plansLoading && (
        <PackGrid
          title="Top-up credit packs"
          blurb="Top up any time, with or without a plan. Pack credits never expire."
          packs={packs}
          amount={(p) => `${p.credits} credits`}
          currency={currency}
          buyingPack={buyingPack}
          onBuyPack={onBuyPack}
        />
      )}
    </div>
  );
}

// ── Pack grid (credit packs and Clip Minute packs) ──────────────────────────
function PackGrid({ title, blurb, packs, amount, currency, buyingPack, onBuyPack }: {
  title: string;
  blurb: string;
  packs: DbPlan[];
  amount: (pack: DbPlan) => string;
  currency: Currency;
  buyingPack: string | null;
  onBuyPack: (pack: DbPlan) => void;
}) {
  if (packs.length === 0) return null;
  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-surface-3" />
        <p className="text-xs font-bold text-fg-subtle uppercase tracking-widest whitespace-nowrap">{title}</p>
        <div className="h-px flex-1 bg-surface-3" />
      </div>
      <p className="text-center text-xs text-fg-subtle mb-4">{blurb}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {packs.map(pack => {
          const price = formatMoney(minorUnits(pack, currency), currency);
          return (
            <div key={pack.id} className="flex flex-col p-4 bg-panel rounded-xl border-2 border-line">
              <p className="font-semibold text-fg text-sm">{pack.name}</p>
              <p className="text-xs text-fg-muted mt-0.5">{amount(pack)}</p>
              <p className="font-bold text-fg mt-1.5">{price}</p>
              <button
                type="button"
                onClick={() => onBuyPack(pack)}
                disabled={!!buyingPack}
                className="mt-3 flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-surface-3 text-sm font-semibold text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-raised disabled:opacity-60"
              >
                {buyingPack === pack.slug ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg/30 border-t-fg" />Buying…</>
                ) : `Buy for ${price}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
