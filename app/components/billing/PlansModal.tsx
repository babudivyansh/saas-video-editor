"use client";
import { useEffect, useRef, useState } from "react";
import { listableMinutePacks } from "@/lib/conversion";
import { trackFunnel } from "@/app/components/billing/trackFunnel";
import type { UpgradePlacement } from "@/lib/conversion";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import { PURCHASABLE_TIER_ORDER, TIER_LABEL, TRIAL_CREDITS, TRIAL_DAYS, TRIAL_MINUTES, isTrialPlan } from "@/lib/plans/tiers";
import { CheckoutModal } from "@/app/pricing/_components/CheckoutModal";
import { planCta } from "@/lib/plans/plan-cta";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";
import { formatDate } from "@/lib/format";
import { trialStatus } from "@/lib/billing/trial-status";
import { PlanCard } from "@/app/components/billing/PlanCard";
import { ConfirmPlanDialog } from "@/app/components/billing/ConfirmPlanDialog";
import { useCreatorDiscount, creatorDiscountApplies } from "@/app/components/billing/useCreatorDiscount";
import { diwaliOfferApplies } from "@/lib/campaigns/diwali";
import { bfPlanBonus } from "@/lib/campaigns/black-friday";
import { BF_COPY, BfTag, bfPlanEligibleFor, useBlackFridayLive } from "@/app/components/campaign/BlackFriday";
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
  /** Opens Manage subscription (cancel, resume, receipts) from the plan strip. */
  onManage?: () => void;
  /** Go straight to one offer (BillingOverlayContext OpenBillingOptions). */
  intent?: "trial" | "pack";
  packSlug?: string;
  /** Which upgrade offer opened the plans, for the paywall funnel. */
  placement?: UpgradePlacement;
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
export function PlansModal({ onPurchaseSuccess, resumeFromPeriodEnd = false, onManage, intent, packSlug, placement = "other" }: PlansModalProps) {
  const { user } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();

  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [term, setTerm] = useState(1);
  const [currency, setCurrency] = useState<Currency>("INR");
  // A subscriber sees prices in the currency they already pay in; everyone
  // else gets the browser-locale guess /pricing uses.
  const subscriptionCurrency = user?.subscriptionCurrency ?? null;
  useEffect(() => {
    setCurrency(subscriptionCurrency ?? inferCurrencyFromLocale(typeof navigator !== "undefined" ? navigator.language : null));
  }, [subscriptionCurrency]);

  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);
  // Whether the open checkout is the Pro trial (then it uses /pricing's
  // CheckoutModal, which shows "₹0 due today" and "Start free trial").
  const [checkoutTrial, setCheckoutTrial] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const creatorDiscount = useCreatorDiscount(!!user);

  // Once per opening of this view.
  useEffect(() => {
    trackFunnel({ type: "plans_viewed", placement });
  }, [placement]);

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const subs = plans.filter(p => p.kind === "subscription");
  const packs = plans.filter(p => p.kind === "pack");
  const minutePacks = listableMinutePacks(plans.filter(p => p.kind === "minute_pack"), user);

  const hasActivePlan = !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();
  const currentPlan = subs.find(p => p.slug === user?.plan?.slug) ?? null;
  const currentInterval = currentPlan?.intervalMonths ?? null;
  const checkoutLoading = checkoutPlan != null && activeId === checkoutPlan.slug;

  // Open on the billing period the subscriber is on, so their own plan is
  // among the cards rather than hidden behind the other toggle.
  useEffect(() => {
    if (currentInterval) setTerm(currentInterval);
  }, [currentInterval]);

  // The Pro trial, on the same terms /pricing and /api/billing/checkout
  // use (lib/billing/trial.ts): once per account, first purchase only, never
  // over a running plan. Every in-app "Try Pro free" button opens this view,
  // which until 2026-11-19 had no trial at all — only /pricing did.
  const trialEligible =
    !!user && !user.trialUsedAt && !user.hasPurchased && !hasActivePlan && !resumeFromPeriodEnd;
  // Black Friday 2026 — same rule as api/billing/checkout's bf26 stamp.
  const bfLive = useBlackFridayLive();
  const bfPlanEligible = bfPlanEligibleFor(user);

  // An upgrade offer that asked for one thing ("Start 3-day trial", "Get 40
  // minutes for ₹199") lands on it, once, as soon as the plans have loaded.
  const intentHandled = useRef(false);
  useEffect(() => {
    if (intentHandled.current || plansLoading || !intent) return;
    intentHandled.current = true;
    if (intent === "trial") {
      const trialPlan = plans.find(p => isTrialPlan(p));
      if (trialPlan && trialEligible) openCheckout(trialPlan, true);
    } else if (intent === "pack" && packSlug) {
      const pack = plans.find(p => p.slug === packSlug && (p.kind === "pack" || p.kind === "minute_pack"));
      if (pack) handleBuyPack(pack);
    }
    // openCheckout / handleBuyPack are plain functions recreated each render;
    // this runs once, after the plans arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansLoading, intent, packSlug, plans, trialEligible]);

  function openCheckout(plan: DbPlan, trial = false) {
    setCheckoutPlan(plan);
    setCheckoutTrial(trial);
    setCheckoutError("");
  }

  function backToBrowse() {
    setCheckoutPlan(null);
    setCheckoutTrial(false);
  }

  function handlePay() {
    if (!checkoutPlan) return;
    setCheckoutError("");
    startCheckout({
      planId: checkoutPlan.slug,
      currency,
      resumeFromPeriodEnd,
      placement,
      ...(checkoutTrial
        ? {
            trial: true,
            // A trial charges ₹0 — land on Billing, which says the trial has
            // started, when it ends and what it costs after (as /pricing does).
            // A full load on purpose: the overlay reads ?billing=/?success=
            // only on first mount, so a client push would show nothing new.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onSuccess: () => { window.location.href = "/dashboard?billing=1&success=trial"; },
            onError: setCheckoutError,
          }
        : { onSuccess: () => { onPurchaseSuccess(); } }),
    });
  }

  // A credit pack is its own one-time purchase — no plan required.
  function handleBuyPack(pack: DbPlan) {
    startCheckout({ planId: pack.slug, currency, placement, onSuccess: () => { onPurchaseSuccess(); } });
  }

  const trial = trialStatus(user);

  // Renders bare — BillingOverlay supplies the dialog, backdrop and close
  // button. This used to be a hand-rolled `fixed inset-0` overlay with no focus
  // trap, ESC handling or portal; folding it into the shared overlay means it
  // inherits all three.
  return (
    <div className="flex flex-col min-h-0">
        {/* Picking a plan opens a compact confirm dialog over the plans,
            rather than swapping the page for an order summary. */}
        {checkoutPlan && checkoutTrial && (
          <CheckoutModal
            plan={checkoutPlan}
            trial
            currency={currency}
            activePlanEndsAt={null}
            loading={checkoutLoading}
            error={checkoutError}
            onPay={handlePay}
            onClose={backToBrowse}
            bfEligible={bfPlanEligible}
          />
        )}
        {checkoutPlan && !checkoutTrial && (
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
            bfBonusMinutes={bfLive && bfPlanEligible ? bfPlanBonus(checkoutPlan.monthlyMinutes ?? 0) : 0}
            creatorDiscount={
              creatorDiscount &&
              creatorDiscountApplies({
                currency,
                trial: false,
                otherOffer: diwaliOfferApplies({ intervalMonths: checkoutPlan.intervalMonths ?? 1, currency, trial: false }),
              })
                ? creatorDiscount
                : null
            }
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
            trialEligible={trialEligible}
            currentPlan={currentPlan}
            hasActivePlan={hasActivePlan}
            bfPlanEligible={bfPlanEligible}
            bfLive={bfLive}
            planStrip={hasActivePlan && currentPlan ? (
              <CurrentPlanStrip
                plan={currentPlan}
                currency={currency}
                endsAt={user?.subscriptionEndsAt ?? null}
                cancelled={!!user?.subscriptionCancelledAt}
                trialEndsAt={trial?.endsAt ?? null}
                onManage={onManage}
              />
            ) : null}
          />
    </div>
  );
}

// ── Browse step ──────────────────────────────────────────────────────────────
function BrowseStep({ plansLoading, subs, packs, minutePacks, term, onTermChange, currency, onCurrencyChange, buyingPack, onBuyPack, onSelectPlan, trialEligible, currentPlan, hasActivePlan, planStrip, bfPlanEligible, bfLive }: {
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
  onSelectPlan: (plan: DbPlan, trial?: boolean) => void;
  trialEligible: boolean;
  currentPlan: DbPlan | null;
  hasActivePlan: boolean;
  planStrip: React.ReactNode;
  bfPlanEligible: boolean;
  bfLive: boolean;
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
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 pt-6 pb-16">
      {planStrip}
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
              aria-pressed={currency === c}
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
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-[480px] animate-pulse rounded-[var(--radius-card)] border border-line bg-surface-2" />)}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-center text-fg-subtle text-sm py-12">Pricing is being updated. Please check back shortly.</p>
      ) : (
        // Same card and look as /pricing (which adds a Starter card in front),
        // three paid tiers across. Lite (2026-10-30) briefly made this four
        // and was retired 2026-11-20. "Most popular" sits on Pro in both.
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(plan => {
            const cta = planCta(plan, currentPlan, hasActivePlan);
            const isCurrent = currentPlan?.slug === plan.slug;
            const offerTrial = isTrialPlan(plan) && trialEligible;
            const perMonth = formatMoney(Math.round(minorUnits(plan, currency) / (plan.intervalMonths ?? 1)), currency);
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                subs={subs}
                currency={currency}
                highlighted={plan.tier === "pro"}
                // Recommended plan first on phones, where only one card is on screen.
                className={plan.tier === "pro" ? "max-sm:order-first" : ""}
                isCurrent={isCurrent}
                onSelect={(p) => onSelectPlan(p, offerTrial)}
                size="compact"
                bfEligible={bfPlanEligible}
                ctaLabel={offerTrial ? `Start ${TRIAL_DAYS}-day free trial` : cta.label}
                ctaDisabled={cta.disabled}
                footer={
                  offerTrial ? (
                    <p className="text-center text-xs text-fg-muted">
                      {TRIAL_MINUTES} Clip Minutes + {TRIAL_CREDITS} credits to try · then {perMonth}/mo ·{" "}
                      <button type="button" onClick={() => onSelectPlan(plan)} className="font-medium text-primary underline-offset-2 hover:underline">
                        or buy now
                      </button>
                    </p>
                  ) : (
                    <p className="text-center text-xs text-fg-subtle">
                      {isCurrent && hasActivePlan ? "You're on this plan" : "Cancel anytime"}
                    </p>
                  )
                }
              />
            );
          })}
        </div>
      )}
      {!plansLoading && cards.length > 0 && (
        <p className="mt-5 text-center text-xs">
          <a
            href="/pricing#compare"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Compare every feature
          </a>
        </p>
      )}

      {!plansLoading && (
        <PackGrid
          title="Clip Minute packs"
          blurb="For Auto Clips — 1 minute per minute of video. Pack minutes never expire."
          packs={minutePacks}
          amount={(p) => `${(bfLive ? BF_COPY.packTotal(p.minutes ?? 0) : p.minutes ?? 0).toLocaleString("en-IN")} Clip Minutes`}
          bf={bfLive}
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

// ── Current plan strip ───────────────────────────────────────────────────────
// A subscriber opening this page wants to switch tiers, so their own plan, its
// renewal and Manage subscription sit in one line above the cards instead of
// on a separate screen.
function CurrentPlanStrip({ plan, currency, endsAt, cancelled, trialEndsAt, onManage }: {
  plan: DbPlan;
  currency: Currency;
  endsAt: string | null;
  cancelled: boolean;
  trialEndsAt: Date | null;
  onManage?: () => void;
}) {
  const months = plan.intervalMonths ?? 1;
  const price = formatMoney(minorUnits(plan, currency), currency);
  const when = trialEndsAt
    ? `free trial until ${formatDate(trialEndsAt.toISOString())}`
    : endsAt
      ? `${cancelled ? "access until" : "renews"} ${formatDate(endsAt)}`
      : null;
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface-2 px-5 py-3.5">
      <p className="text-sm text-fg-muted">
        <span className="font-semibold text-success">{plan.tier ? TIER_LABEL[plan.tier] : plan.name}</span>
        {" · your plan"}
        {when && <> · {when}</>}
        {` · ${price}/${months > 1 ? "yr" : "mo"}`}
      </p>
      {onManage && (
        <button type="button" onClick={onManage} className="text-sm font-semibold text-primary hover:text-primary-hover">
          Manage subscription
        </button>
      )}
    </div>
  );
}

// ── Pack grid (credit packs and Clip Minute packs) ──────────────────────────
function PackGrid({ title, blurb, packs, amount, currency, buyingPack, onBuyPack, bf = false }: {
  /** Black Friday 2026 Clip Minutes packs: strike the normal minutes, tag 2×. */
  bf?: boolean;
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
          const detail = amount(pack);
          return (
            <div key={pack.id} className="flex flex-col p-4 bg-surface-2 rounded-xl border border-line">
              <p className="font-semibold text-fg text-sm">{pack.name}</p>
              {/* "100 Clip Minutes / 100 Clip Minutes" — skip a line that only repeats the name. */}
              {bf ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted">
                  <s className="text-fg-subtle" aria-label={`Normally ${pack.minutes ?? 0} minutes`}>{pack.minutes ?? 0}</s>
                  <span className="font-semibold text-fg">{detail}</span>
                  <BfTag />
                </p>
              ) : detail.toLowerCase() !== pack.name.toLowerCase() && (
                <p className="text-xs text-fg-muted mt-0.5">{detail}</p>
              )}
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
