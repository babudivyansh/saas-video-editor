"use client";

import { useState, useEffect } from "react";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import {
  PURCHASABLE_TIER_ORDER, TIER_LABEL, TRIAL_CREDITS,
  FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER,
} from "@/lib/plans/tiers";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";
import { PlanCard } from "@/app/components/billing/PlanCard";
// Price maths and tier copy are shared with the billing PlansModal so the two
// surfaces can't drift — the modal a signed-in customer buys through had been
// left on the pre-audit design while this page was rebuilt.
import { minorUnits, yearlySavePct, cheapestImageCost } from "@/lib/plans/display";
import { PricingHero, TrustRow } from "./_components/PricingHero";
import { FreeCard } from "./_components/FreeCard";
import { CreditsExplainer } from "./_components/CreditsExplainer";
import { AddonStrip } from "./_components/AddonStrip";
import { CompareTable } from "./_components/CompareTable";
import { CheckoutModal } from "./_components/CheckoutModal";
import type { DbPlan, ToolCost } from "./_components/types";

// Both ends of the image-price range, derived rather than asserted — the FAQ
// used to claim "1-8 credits" when the cheapest model is 2.
const MAX_IMAGE_COST = Math.max(...IMAGE_MODELS.map(m => m.creditCost));

const FAQS = [
  {
    question: "What is a credit?",
    answer: `Credits pay for AI tools, and each tool has a set price: ${cheapestImageCost}-${MAX_IMAGE_COST} credits for an image, 2 for a voiceover, per-second pricing for video. Subscription credits refill monthly and unused ones roll over, up to ${SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER}× your allowance. Add-on pack credits never expire, even if your subscription lapses.`,
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Cancel from your account settings and keep your plan until the end of the current billing period. No cancellation fees.",
  },
  {
    question: "Do you offer refunds?",
    answer: "Yes. Request within 48 hours of purchase, before spending any of the purchased credits, and we refund you in full. See the Refund Policy for details.",
  },
  {
    question: "Can I switch plans later?",
    answer: "Yes, from your billing page at any time. Switching starts a fresh term on the new plan from that day (it doesn't extend or pro-rate the current one), and any credits already in your account come with you.",
  },
  {
    question: "Can I use the clips commercially?",
    answer: "Yes. Everything you make with Clipiro is yours to use commercially on any platform: YouTube, Instagram, client work and more.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "UPI, credit and debit cards, net banking and all major wallets (Paytm, PhonePe, Google Pay), via Razorpay.",
  },
  {
    question: "Is there a free plan?",
    answer: `Yes. Every account gets ${FREE_TIER_MONTHLY_BONUS_CREDITS} credits a month for AI tools, plus ${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} watermarked Auto Clip runs, and the free tools (audio balancer, MP3 converter, video compressor, downloaders) never use credits. No card required.`,
  },
];

// ToastProvider is not mounted globally in this app (see app/dashboard/page.tsx),
// so the page wraps itself to show the post-payment confirmation.
export default function PricingPage() {
  return (
    <ToastProvider>
      <PricingPageInner />
    </ToastProvider>
  );
}

function PricingPageInner() {
  const { user, openAuthModal, isLoading: authLoading } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();
  const { showToast } = useToast();
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [term, setTerm] = useState(1);
  // Default from the browser locale, then let the visitor override. Set in an
  // effect rather than during render so server and client markup agree.
  const [currency, setCurrency] = useState<Currency>("INR");
  useEffect(() => {
    setCurrency(inferCurrencyFromLocale(typeof navigator !== "undefined" ? navigator.language : null));
  }, []);
  const [toolCosts, setToolCosts] = useState<ToolCost[]>([]);

  // Checkout state. A subscription checkout is exactly its plan — no add-on
  // bundling, no coupon: both were shown here but never charged or applied
  // (see app/pricing/_components/CheckoutModal.tsx).
  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);
  const [checkoutTrial, setCheckoutTrial] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Derived loading flags from the shared checkout hook.
  const checkoutLoading = checkoutPlan != null && activeId === checkoutPlan.slug;
  const buyingPack = activeId;

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  // Live per-feature credit costs for the "Cost per tool" tab.
  useEffect(() => {
    fetch("/api/tool-costs")
      .then(res => (res.ok ? res.json() : { tools: [] }))
      .then((data: { tools: ToolCost[] }) => setToolCosts(data.tools ?? []))
      .catch(() => setToolCosts([]));
  }, []);

  // Detect ?success=1 after Razorpay redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      showToast("Payment successful! Credits will appear in your account shortly.");
      window.history.replaceState({}, "", "/pricing");
    }
  }, [showToast]);

  const packs = plans.filter(p => p.kind === "pack");
  const subs  = plans.filter(p => p.kind === "subscription");
  const savePct = yearlySavePct(subs, currency);

  // True only while the subscription period hasn't lapsed.
  const hasActivePlan =
    !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();

  // The 7-day trial is Pro-only and once per account, matching what
  // /api/billing/checkout will actually accept. Signed-out visitors see it
  // too — a new account is always eligible — and are sent to register first.
  const trialEligible = !user || (!user.trialUsedAt && !hasActivePlan);

  const openCheckout = (plan: DbPlan, trial = false) => {
    setCheckoutPlan(plan);
    setCheckoutTrial(trial);
    setCheckoutError("");
  };

  const selectPlan = (plan: DbPlan, trial = false) => {
    if (authLoading) return;
    if (user) openCheckout(plan, trial);
    else openAuthModal("register", plan.tier ? TIER_LABEL[plan.tier] : plan.name);
  };

  const handlePay = () => {
    if (!checkoutPlan) return;
    setCheckoutError("");
    startCheckout({
      planId: checkoutPlan.slug,
      trial: checkoutTrial,
      currency,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
      onError: setCheckoutError,
    });
  };

  const handleBuyPack = (pack: DbPlan) => {
    if (authLoading) return;
    // Packs are open to everyone now (no bundle-with-a-plan toggle), including
    // signed-out visitors — send them to register rather than erroring.
    if (!user) { openAuthModal("register", pack.name); return; }
    setCheckoutError("");
    startCheckout({
      planId: pack.slug,
      currency,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
      onError: (msg) => showToast(msg, "error"),
    });
  };

  const cards = PURCHASABLE_TIER_ORDER
    .map(tier => subs.find(p => p.tier === tier && p.intervalMonths === term))
    .filter((p): p is DbPlan => !!p);

  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg">
      <SiteNavbar solid />

      <PricingHero
        term={term}
        onTerm={setTerm}
        currency={currency}
        onCurrency={setCurrency}
        savePct={savePct}
      />

      {/* ── Plans ── */}
      <section id="plans" className="relative mx-auto mt-12 max-w-6xl scroll-mt-24 px-4 sm:mt-14 sm:px-6 lg:px-8">
        {plansLoading ? (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-[520px] animate-pulse rounded-[var(--radius-card)] border border-line bg-surface-2 p-7">
                <div className="h-3 w-16 rounded bg-surface-3" />
                <div className="mt-3 h-3 w-32 rounded bg-surface-3" />
                <div className="mt-6 h-10 w-28 rounded bg-surface-3" />
                <div className="mt-6 h-12 w-full rounded-full bg-surface-3" />
                <div className="mt-6 space-y-3">
                  <div className="h-3 w-full rounded bg-surface-3" />
                  <div className="h-3 w-5/6 rounded bg-surface-3" />
                  <div className="h-3 w-4/6 rounded bg-surface-3" />
                </div>
              </div>
            ))}
          </div>
        ) : cards.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">Pricing is being updated. Please check back shortly.</p>
        ) : (
          // items-stretch so all four cards share the tallest height; each card
          // uses the same section order, so price, CTA and bullets line up.
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FreeCard currency={currency} />
            {cards.map(plan => {
              const isPro = plan.tier === "pro";
              const offerTrial = isPro && trialEligible;
              const perMonth = formatMoney(Math.round(minorUnits(plan, currency) / (plan.intervalMonths ?? 1)), currency);
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  subs={subs}
                  currency={currency}
                  highlighted={isPro}
                  // Recommended plan first on phones, where only one card is on screen.
                  className={isPro ? "max-sm:order-first" : ""}
                  onSelect={p => selectPlan(p, offerTrial)}
                  ctaLabel={offerTrial ? "Start 7-day free trial" : undefined}
                  footer={
                    offerTrial ? (
                      <p className="text-center text-xs text-fg-muted">
                        {TRIAL_CREDITS} trial credits · then {perMonth}/mo ·{" "}
                        <button type="button" onClick={() => selectPlan(plan)} className="font-medium text-primary underline-offset-2 hover:underline">
                          or buy now
                        </button>
                      </p>
                    ) : (
                      <p className="text-center text-xs text-fg-subtle">Cancel anytime</p>
                    )
                  }
                />
              );
            })}
          </div>
        )}
        <TrustRow />
      </section>

      {/* Mounted only once plans have loaded: Tabs picks its initial tab on
          mount, and if /api/tool-costs answered first the section opened on
          "Cost per tool" and stayed there. */}
      {!plansLoading && (
        <CreditsExplainer
          subs={subs}
          term={term}
          toolCosts={toolCosts}
          onChoose={plan => {
            document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" });
            selectPlan(plan);
          }}
        />
      )}

      {!plansLoading && (
        <AddonStrip
          packs={packs}
          currency={currency}
          buyingPack={buyingPack}
          onBuy={handleBuyPack}
        />
      )}

      {!plansLoading && subs.length > 0 && <CompareTable subs={subs} term={term} />}

      {/* ── FAQ ── */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 sm:px-6 sm:pb-28 lg:grid-cols-12 lg:gap-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:col-span-4">
          <h2 className="text-3xl font-semibold tracking-[-0.025em] text-fg sm:text-4xl">Questions</h2>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            Can&apos;t find it here?{" "}
            <a href="mailto:support@clipiro.com" className="text-primary hover:text-primary-hover">Email support</a>.
            We reply within 24 hours.
          </p>
        </div>
        <div className="lg:col-span-8">
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="relative flex flex-col gap-6 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-2 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-52 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
          />
          <div className="relative flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-fg sm:text-3xl">Your first clips are free.</h2>
            <p className="text-[15px] text-fg-muted">
              {FREE_TIER_MONTHLY_BONUS_CREDITS} credits and {FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} Auto Clip runs a month. No card required.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            {user ? (
              <button
                type="button"
                onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}
                className="min-h-12 rounded-full bg-primary px-6 text-[15px] font-semibold text-on-primary hover:bg-primary-hover"
              >
                Choose a plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal("register")}
                className="min-h-12 rounded-full bg-primary px-6 text-[15px] font-semibold text-on-primary hover:bg-primary-hover"
              >
                Start free
              </button>
            )}
            <a
              href="mailto:support@clipiro.com"
              className="flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-3"
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          trial={checkoutTrial}
          currency={currency}
          activePlanEndsAt={hasActivePlan && user?.subscriptionEndsAt ? user.subscriptionEndsAt : null}
          loading={checkoutLoading}
          error={checkoutError}
          onPay={handlePay}
          onClose={() => setCheckoutPlan(null)}
        />
      )}

      <SiteFooter />
    </div>
  );
}
