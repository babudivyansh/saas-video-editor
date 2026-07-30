"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";
import {
  PURCHASABLE_TIER_ORDER, TIER_LABEL, type TierId,
  FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, STORAGE_LIMIT_GB,
} from "@/lib/plans/tiers";
import { IMAGE_MODELS, getImageModel } from "@/lib/models/imageModels";
import { VIDEO_MODELS, getVideoModel } from "@/lib/models/videoModels";
import { IMAGE_GENERATOR_STARTING_CREDIT_COST } from "@/lib/tool-costs";
import { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";

// ── Icons ──────────────────────────────────────────────────────────────────
function ZapIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MinusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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

// ── Data ───────────────────────────────────────────────────────────────────
interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  /** USD minor units, computed server-side per plan by /api/plans. */
  usdPriceInCents: number;
  currency: string;
  credits: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths: number | null;
  monthlyCredits: number | null;
  tier: Exclude<TierId, "free"> | null;
}

interface ToolCost {
  slug: string;
  label: string;
  service: string;
  creditCost: number;
  creditCostMin?: number;
  creditCostMax?: number;
}

interface CalcSelection {
  kind: "image" | "video";
  modelId: string;
  qty: number;
}

interface CalcResult {
  totalCredits: number;
  eligibleTiers: Exclude<TierId, "free">[];
  recommendedPlan: DbPlan | null;
}

function computeRecommendation(selections: CalcSelection[], subs: DbPlan[], term: number): CalcResult {
  const active = selections.filter(s => s.qty > 0);
  const totalCredits = active.reduce((sum, s) => {
    if (s.kind === "image") return sum + getImageModel(s.modelId).creditCost * s.qty;
    const m = getVideoModel(s.modelId);
    const dur = typeof m.defaultValues.duration === "number" ? m.defaultValues.duration : m.minDurationSeconds;
    return sum + m.creditsPerSecond * dur * s.qty;
  }, 0);

  const requiredTierSets = active.map(s =>
    (s.kind === "image" ? getImageModel(s.modelId) : getVideoModel(s.modelId)).allowedTiers
  );
  const eligibleTiers = PURCHASABLE_TIER_ORDER.filter(t => requiredTierSets.every(allowed => allowed.includes(t)));
  const recommendedPlan = eligibleTiers
    .map(t => subs.find(p => p.tier === t && p.intervalMonths === term))
    .find((p): p is DbPlan => !!p && (p.monthlyCredits ?? 0) >= totalCredits) ?? null;

  return { totalCredits, eligibleTiers, recommendedPlan };
}

// Cheapest a single video render actually costs at this tier — used for the
// "≈ N video renders" estimate on each pricing card, mirroring the
// calculator's own math instead of a flat guess.
function cheapestVideoCostPerRender(tier: Exclude<TierId, "free">): number | null {
  const models = VIDEO_MODELS.filter(m => m.allowedTiers.includes(tier));
  if (models.length === 0) return null;
  return Math.min(...models.map(m => {
    const dur = typeof m.defaultValues.duration === "number" ? m.defaultValues.duration : m.minDurationSeconds;
    return Math.ceil(m.creditsPerSecond * dur);
  }));
}

const TERMS = [
  { months: 1,  label: "Monthly" },
  { months: 12, label: "Yearly" },
];

/** Minor units for the selected currency, from the fields /api/plans always returns. */
function minorUnits(plan: DbPlan, currency: Currency): number {
  return currency === "USD" ? plan.usdPriceInCents : plan.priceInPaise;
}

// The yearly discount is *derived* from the actual plan rows rather than
// hardcoded. Plan prices are editable at runtime in /admin/pricing, so a
// constant here would silently drift from the real saving the moment anyone
// edits a price. Returns null when there's nothing to compare against.
//
// Takes the *smallest* saving across the tiers, not the largest or an average:
// this figure headlines the term toggle, and every tier has to deliver at
// least what the badge claims. The tiers can genuinely differ — USD monthly
// prices come from a price book while USD yearly falls back to FX conversion,
// so the discount is not uniform there the way it is in INR. Each card shows
// its own exact percentage alongside this.
function yearlySavePct(subs: DbPlan[], currency: Currency): number | null {
  const pairs = PURCHASABLE_TIER_ORDER.map(tier => {
    const monthly = subs.find(p => p.tier === tier && p.intervalMonths === 1);
    const yearly  = subs.find(p => p.tier === tier && p.intervalMonths === 12);
    if (!monthly || !yearly) return null;
    const full = minorUnits(monthly, currency) * 12;
    if (full <= 0) return null;
    return (full - minorUnits(yearly, currency)) / full;
  }).filter((n): n is number => n != null && n > 0);

  if (pairs.length === 0) return null;
  // Round the same way the per-card figures do, so the badge and the card it
  // was derived from never disagree by a point.
  return Math.round(Math.min(...pairs) * 100);
}

const WORKFLOWS = [
  { name: "Reddit Story Videos", creator: true, pro: true, studio: true },
  { name: "Fake Texts Videos", creator: true, pro: true, studio: true },
  { name: "Split-Screen Videos", creator: true, pro: true, studio: true },
  { name: "Streamer Highlight Videos", creator: true, pro: true, studio: true },
  { name: "Text / Faceless Story Videos", creator: true, pro: true, studio: true },
];

const TOOLS = [
  { name: "AI Voiceover (50+ voices)", creator: true, pro: true, studio: true },
  { name: "Karaoke Captions", creator: true, pro: true, studio: true },
  { name: "AI Image Generator", creator: true, pro: true, studio: true },
  // Creator *does* get the video generator — wan-2.7, ltx-2.3 and pixverse-v6
  // all list "creator" in allowedTiers. Only the premium models are gated, so
  // that's a separate row; marking the whole tool false told Creator buyers
  // they got no video generation at all, contradicting their own plan card.
  { name: "AI Video Generator", creator: true, pro: true, studio: true },
  { name: "Premium video models (Veo3, Seedance)", creator: false, pro: true, studio: true },
  { name: "AI Vocal Remover", creator: true, pro: true, studio: true },
  { name: "AI Voice Changer", creator: true, pro: true, studio: true },
  { name: "AI Speech Enhancer", creator: true, pro: true, studio: true },
  { name: "AI Brainstormer", creator: true, pro: true, studio: true },
  // Pro+ while its provider cost is unverified — see lib/tool-costs.ts.
  { name: "Subtitle Remover", creator: false, pro: true, studio: true },
];

const FAQS = [
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, you can cancel at any time from your account settings. You will retain access to your plan until the end of your current billing period. No cancellation fees.",
  },
  {
    q: "What is a credit?",
    a: "Credits are spent on AI tools — the cost depends on the tool and model you pick (e.g. 1-8 credits for an image, 2 credits for a voiceover, and per-second pricing for video, including the AI Video Generator). Subscription credits refill each month and unused ones roll over, up to 2× your monthly allowance. Add-on credit packs never expire — they stay on your account even if your subscription lapses.",
  },
  {
    q: "How long can each video be?",
    a: "Videos can be up to 5 seconds long on Creator, up to 10 seconds on Pro, and up to 15 seconds on Studio — some models cap lower depending on the provider.",
  },
  {
    q: "Do longer terms cost less?",
    a: "Yes — the yearly plan works out cheaper than paying month-to-month, and the exact saving is shown on each plan card. You're billed once upfront for the full year.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade your plan at any time. Upgrades take effect immediately (with prorated billing); downgrades take effect at the start of your next billing cycle.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes — if you request within 48 hours of purchase and have not spent any of the purchased credits, we'll refund you in full. Please see our Refund Policy for full details.",
  },
  {
    q: "Can I use the videos commercially?",
    a: "Yes. All videos generated with Clipiro are yours to use commercially on any platform — TikTok, YouTube, Instagram, client work, and more.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept UPI, credit/debit cards, net banking, and all major wallets (Paytm, PhonePe, Google Pay) via Razorpay.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — every account can use the free tools (audio balancer, MP3 converter, video compressor, downloaders) at no cost. The AI tools require credits, which come with any subscription plan.",
  },
  {
    q: "Do you support multiple languages for voiceovers?",
    a: "Yes. Our ElevenLabs-powered voiceover engine supports 29+ languages including Hindi, English, Spanish, French, German, Portuguese, and more.",
  },
];

// One-line summary of what a tier unlocks, replacing the old "MODELS INCLUDED"
// block that listed eight model names across two lines of small grey text —
// the densest thing on the card and the hardest to scan. The count and the
// headline names both come from each registry entry's `allowedTiers`, so they
// track the registries instead of drifting. The exhaustive per-model breakdown
// still lives in the comparison table further down the page.
function modelSummary(tier: Exclude<TierId, "free">): { total: number; headline: string[]; all: string } {
  const images = IMAGE_MODELS.filter(m => m.allowedTiers.includes(tier));
  const videos = VIDEO_MODELS.filter(m => m.allowedTiers.includes(tier));
  // Lead with the video models this tier unlocks that the tier below doesn't —
  // that's the actual reason to move up a tier. Falls back to the tier's own
  // video models for Creator, which has nothing below it.
  const below = PURCHASABLE_TIER_ORDER[PURCHASABLE_TIER_ORDER.indexOf(tier) - 1];
  const exclusive = below ? videos.filter(m => !m.allowedTiers.includes(below)) : videos;
  const headline = (exclusive.length > 0 ? exclusive : videos).slice(0, 2).map(m => m.displayName);
  return {
    total: images.length + videos.length,
    headline,
    all: [...images, ...videos].map(m => m.displayName).join(", "),
  };
}

// A plan's `features` are admin-editable, and the card header already renders
// the credit allowance and the yearly saving — so seeded/edited entries like
// "160 credits / month" or "Save 33% vs monthly" render as bullets that just
// repeat the line above them. Drop those here rather than trusting the data.
function isRedundantFeature(feature: string): boolean {
  const f = feature.toLowerCase();
  return /\d+\s*credits?\s*\/?\s*(per\s*)?month/.test(f) || /save\s*\d+%/.test(f);
}

// ── FreeCard ───────────────────────────────────────────────────────────────
// The free tier is real (free tools, a monthly bonus grant, watermarked Auto
// Clip runs) but used to appear only in an FAQ answer near the foot of the
// page. Every figure is read from lib/plans/tiers.ts so it can't drift.
function FreeCard({ currency }: { currency: Currency }) {
  const perks = [
    "All free tools — compressor, MP3, downloaders",
    `${FREE_TIER_MONTHLY_BONUS_CREDITS} bonus credits every month`,
    `${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} Auto Clip runs / month (watermarked)`,
    `${STORAGE_LIMIT_GB.free * 1000} MB storage`,
  ];
  return (
    <div className="relative h-full rounded-2xl p-8 border-2 border-gray-100 bg-white text-gray-900 shadow-sm flex flex-col">
      <div className="mb-6">
        <p className="text-sm font-bold uppercase tracking-widest mb-1 text-gray-400">Free</p>
        <div className="flex items-start gap-0.5">
          <span className="text-xl font-bold mt-1.5 text-gray-400">{currency === "USD" ? "$" : "₹"}</span>
          <span className="text-5xl font-black leading-none tracking-tight">0</span>
          <span className="text-sm font-medium self-end mb-1 ml-1 text-gray-400">/month</span>
        </div>
        <p className="text-xs mt-2 text-gray-500">No card required</p>
        <p className="text-sm font-semibold mt-4 pt-4 border-t border-gray-100 text-gray-900">
          {FREE_TIER_MONTHLY_BONUS_CREDITS} credits every month
        </p>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {perks.map(p => (
          <li key={p} className="flex items-start gap-2.5 text-sm">
            <CheckIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600" />
            <span className="text-gray-700">{p}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/register"
        className="w-full mt-auto text-center font-bold py-3 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition-all"
      >
        Start free
      </Link>
      <p className="text-center text-[11px] mt-2 text-gray-400">Upgrade whenever you need more</p>
    </div>
  );
}

// ── CompareRow ─────────────────────────────────────────────────────────────
function CompareRow({ feature, creator, pro, studio, shaded }: {
  feature: string; creator: boolean; pro: boolean; studio: boolean; shaded: boolean;
}) {
  const cell = (val: boolean, highlight: boolean) => (
    <td className={`text-center py-4 px-4 ${highlight ? "bg-blue-50/50" : ""}`}>
      {val
        ? <CheckIcon className="w-5 h-5 text-blue-600 mx-auto" />
        : <MinusIcon className="w-5 h-5 text-gray-300 mx-auto" />}
    </td>
  );
  return (
    <tr className={shaded ? "bg-gray-50" : "bg-white"}>
      <td className="py-4 px-6 text-sm text-gray-700">{feature}</td>
      {cell(creator, false)}
      {cell(pro, true)}
      {cell(studio, false)}
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const { user, token, openAuthModal, isLoading: authLoading } = useAuth();
  const { startCheckout, activeId } = useRazorpayCheckout();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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
  const [showAllCosts, setShowAllCosts] = useState(false);

  // Checkout state
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);
  const [checkoutTrial, setCheckoutTrial] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);

  // Coupon state (scoped to the checkout modal)
  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; discountInPaise: number } | null>(null);

  // Credit calculator state — lets a visitor estimate monthly credit usage
  // and see which plan (if any) covers both the credit total and every
  // selected model's tier requirement.
  const [calcSelections, setCalcSelections] = useState<CalcSelection[]>([
    { kind: "image", modelId: IMAGE_MODELS[0].id, qty: 0 },
  ]);

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

  // Live per-feature credit costs for the "what each feature costs" table.
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
      setSuccessBanner(true);
      window.history.replaceState({}, "", "/pricing");
    }
  }, []);

  const packs = plans.filter(p => p.kind === "pack");
  const subs  = plans.filter(p => p.kind === "subscription");
  const savePct = yearlySavePct(subs, currency);

  // True only while the subscription period hasn't lapsed.
  const hasActivePlan =
    !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();

  const addCalcRow = () => {
    setCalcSelections(prev => [...prev, { kind: "image", modelId: IMAGE_MODELS[0].id, qty: 0 }]);
  };
  const updateCalcRow = (idx: number, patch: Partial<CalcSelection>) => {
    setCalcSelections(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      // Switching kind means the previously-selected modelId is invalid — reset to that kind's first model.
      if (patch.kind && patch.kind !== s.kind) {
        next.modelId = (patch.kind === "image" ? IMAGE_MODELS[0] : VIDEO_MODELS[0]).id;
      }
      return next;
    }));
  };
  const removeCalcRow = (idx: number) => {
    setCalcSelections(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleAddon = (slug: string) => {
    setSelectedAddons(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
    // Cart total changed → invalidate any applied coupon so it re-validates.
    setAppliedCoupon(null);
    setCouponError("");
  };

  const openCheckout = (plan: DbPlan, trial = false) => {
    setCheckoutPlan(plan);
    setCheckoutTrial(trial);
    setRenewalWarningDismissed(false);
    setCouponInput("");
    setCouponError("");
    setAppliedCoupon(null);
  };

  // Coupons are INR-native (validated and discounted against the stored
  // priceInPaise), so hide the coupon UI on USD rather than showing a field
  // that silently does nothing server-side — same rule as PlansModal.
  const couponsAvailable = currency === "INR";

  // The 7-day trial is Pro-only and once per account, matching what
  // /api/billing/checkout will actually accept.
  const trialEligible = !!user && !user.trialUsedAt && !hasActivePlan;

  // Re-validate / clear the coupon whenever the cart (plan or add-ons) changes.
  const clearCoupon = () => { setAppliedCoupon(null); setCouponError(""); };

  const applyCoupon = async () => {
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
  };

  const handlePay = () => {
    if (!checkoutPlan) return;
    startCheckout({
      planId: checkoutPlan.slug,
      addonIds: selectedAddons,
      couponCode: couponsAvailable ? appliedCoupon?.code : undefined,
      trial: checkoutTrial,
      currency,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
    });
  };

  const handleBuyPack = (pack: DbPlan) => {
    startCheckout({
      planId: pack.slug,
      currency,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
    });
  };

  // Cart totals in the selected currency's minor units, so the summary matches
  // the figures on the cards instead of always quoting rupees.
  const totalDueMinor =
    (checkoutPlan ? minorUnits(checkoutPlan, currency) : 0) +
    selectedAddons.reduce((s, slug) => {
      const pack = packs.find(p => p.slug === slug);
      return s + (pack ? minorUnits(pack, currency) : 0);
    }, 0);

  // Coupon discounts are stored in paise and only offered on INR checkout.
  const discountedTotalMinor = appliedCoupon && couponsAvailable
    ? Math.max(100, totalDueMinor - appliedCoupon.discountInPaise)
    : totalDueMinor;

  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />

      {/* ── Success banner ── */}
      {successBanner && (
        <div className="bg-green-500 text-white text-center py-3 px-4 text-sm font-semibold flex items-center justify-center gap-3">
          <CheckIcon className="w-4 h-4" />
          Payment successful! Credits will appear in your account shortly.
          <button onClick={() => setSuccessBanner(false)} className="ml-2 underline opacity-75 hover:opacity-100 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="pt-16 pb-4 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
          Pro video tools. One credit at a time.
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">
          Every AI tool — voiceovers, captions, AI-generated videos, and more — in one plan.
          {savePct != null && (
            <> Go <span className="font-semibold text-gray-700">yearly to save {savePct}%</span>.</>
          )}
        </p>
      </section>

      {/* ── Trust Strip ── */}
      <div className="border-y border-gray-100 bg-gray-50 py-5 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-10 gap-y-3 text-center text-sm">
          <span className="text-gray-500">✓ <strong className="text-gray-700">48-hour money-back</strong> guarantee</span>
          <span className="text-gray-500">✓ <strong className="text-gray-700">No hidden fees</strong> — cancel anytime</span>
          <span className="text-gray-500">✓ <strong className="text-gray-700">UPI, cards & wallets</strong> via Razorpay</span>
          <span className="text-gray-500">✓ <strong className="text-gray-700">Commercial license</strong> on all plans</span>
        </div>
      </div>

      {/* ── Pricing Cards ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Term + currency toggles */}
        <div className="flex flex-wrap justify-center items-center gap-3 mb-10">
          <div className="inline-flex bg-gray-100 rounded-full p-1">
            {TERMS.map(t => (
              <button
                key={t.months}
                onClick={() => setTerm(t.months)}
                className={`relative px-5 sm:px-7 py-2 rounded-full text-sm font-semibold transition-all ${
                  term === t.months ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:text-gray-900"
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

          <div className="inline-flex bg-gray-100 rounded-full p-1" role="group" aria-label="Currency">
            {(["INR", "USD"] as const).map(c => (
              <button
                key={c}
                onClick={() => { setCurrency(c); clearCoupon(); }}
                aria-pressed={currency === c}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  currency === c ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        {plansLoading ? (
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-2xl p-8 border-2 border-gray-100 bg-white h-96 animate-pulse">
                <div className="h-3 w-16 rounded bg-gray-100" />
                <div className="h-9 w-28 rounded bg-gray-200 mt-3" />
                <div className="h-3 w-24 rounded bg-gray-100 mt-3" />
                <div className="h-px bg-gray-100 mt-6" />
                <div className="space-y-3 mt-6">
                  <div className="h-3 w-full rounded bg-gray-100" />
                  <div className="h-3 w-5/6 rounded bg-gray-100" />
                  <div className="h-3 w-4/6 rounded bg-gray-100" />
                </div>
                <div className="h-11 w-full rounded-full bg-gray-100 mt-8" />
              </div>
            ))}
          </div>
        ) : (() => {
          const cards = PURCHASABLE_TIER_ORDER
            .map(tier => subs.find(p => p.tier === tier && p.intervalMonths === term))
            .filter((p): p is DbPlan => !!p);

          if (cards.length === 0) {
            return (
              <p className="text-center text-gray-400 text-sm py-12">
                Pricing is being updated. Please check back shortly.
              </p>
            );
          }

          // items-stretch (not items-start) so all four cards share the tallest
          // height and their CTAs line up — the row was previously ragged at
          // 542/629/677/645px.
          return (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
              <FreeCard currency={currency} />
              {cards.map((plan, idx) => {
                const highlighted = idx === 1;
                const total    = minorUnits(plan, currency);
                const months   = plan.intervalMonths ?? 1;
                const perMonth = Math.round(total / months);
                const baseTier = plan.tier ? TIER_LABEL[plan.tier] : plan.name.replace(/\s*\(.*\)$/, "");
                // Per-tier saving, derived from this tier's own monthly row so
                // the figure is never a rounded page-wide average.
                const monthlyPlan = months > 1 && plan.tier
                  ? subs.find(p => p.tier === plan.tier && p.intervalMonths === 1)
                  : null;
                const fullYear = monthlyPlan ? minorUnits(monthlyPlan, currency) * 12 : null;
                const tierSavePct = fullYear && fullYear > total
                  ? Math.round(((fullYear - total) / fullYear) * 100)
                  : null;
                return (
                  <div
                    key={plan.id}
                    className={`relative h-full rounded-2xl p-8 border-2 flex flex-col ${
                      highlighted
                        ? "border-blue-600 bg-blue-600 text-white shadow-2xl lg:scale-105 lg:z-10"
                        : "border-gray-100 bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {highlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        {/* whitespace-nowrap is load-bearing: the grid went from
                            3 cards to 4, and at ~267px the pill wrapped onto two
                            lines and hung off the top of the card. */}
                        <span className="block whitespace-nowrap bg-green-400 text-green-900 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wide">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="mb-6">
                      <p className={`text-sm font-bold uppercase tracking-widest mb-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                        {baseTier}
                      </p>
                      {/* The price, and nothing competing with it. The symbol is
                          its own element so it can sit small and top-aligned
                          rather than reading as another digit. */}
                      <div className="flex items-start gap-0.5">
                        <span className={`text-xl font-bold mt-1.5 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                          {currency === "USD" ? "$" : "₹"}
                        </span>
                        <span className="text-5xl font-black leading-none tracking-tight">
                          {perMonth === 0 ? "0" : formatMoney(perMonth, currency).replace(/^[₹$]/, "")}
                        </span>
                        <span className={`text-sm font-medium self-end mb-1 ml-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                          /month
                        </span>
                      </div>

                      {/* One secondary line, only when yearly changes the story. */}
                      {months > 1 && (
                        <p className={`text-xs mt-2 ${highlighted ? "text-blue-100" : "text-gray-500"}`}>
                          Billed {formatMoney(total, currency)} yearly
                          {tierSavePct && (
                            <span className={`font-bold ${highlighted ? "text-green-300" : "text-green-600"}`}>
                              {" "}· save {tierSavePct}%
                            </span>
                          )}
                        </p>
                      )}

                      <p className={`text-sm font-semibold mt-4 pt-4 border-t ${
                        highlighted ? "text-white border-white/20" : "text-gray-900 border-gray-100"
                      }`}>
                        {plan.monthlyCredits} credits every month
                      </p>
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {/* Models: one line instead of the old two-line name dump. */}
                      {plan.tier && (() => {
                        const m = modelSummary(plan.tier);
                        return (
                          <li className="flex items-start gap-2.5 text-sm">
                            <CheckIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? "text-blue-200" : "text-blue-600"}`} />
                            <span className={highlighted ? "text-blue-100" : "text-gray-700"} title={m.all}>
                              {m.total} AI models{m.headline.length > 0 && <>, incl. {m.headline.join(" & ")}</>}
                            </span>
                          </li>
                        );
                      })()}
                      {/* Credits→output equivalence. The "cheapest model" caveat
                          is a tooltip rather than inline text — spelled out it
                          wrapped this bullet onto three lines. */}
                      {plan.monthlyCredits != null && (() => {
                        const perRender = plan.tier ? cheapestVideoCostPerRender(plan.tier) : null;
                        const images = Math.floor(plan.monthlyCredits / IMAGE_GENERATOR_STARTING_CREDIT_COST);
                        return (
                          <li className="flex items-start gap-2.5 text-sm">
                            <CheckIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? "text-blue-200" : "text-blue-600"}`} />
                            <span
                              className={highlighted ? "text-blue-100" : "text-gray-700"}
                              title="Based on the lowest-cost model available on this plan; premium models cost more credits."
                            >
                              ≈ {images} images or {perRender ? Math.floor(plan.monthlyCredits / perRender) : 0} videos
                            </span>
                          </li>
                        );
                      })()}
                      {plan.features.filter(f => !isRedundantFeature(f)).map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm">
                          <CheckIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? "text-blue-200" : "text-blue-600"}`} />
                          <span className={highlighted ? "text-blue-100" : "text-gray-700"}>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => {
                        if (authLoading) return;
                        if (user) openCheckout(plan);
                        else openAuthModal("register", baseTier);
                      }}
                      disabled={authLoading}
                      className={`w-full mt-auto font-bold py-3 rounded-full transition-all disabled:opacity-60 disabled:cursor-wait ${
                        highlighted
                          ? "bg-white text-blue-600 hover:bg-blue-50 shadow-lg"
                          : "bg-blue-600 text-white hover:bg-blue-700 ring-1 ring-blue-200"
                      }`}
                    >
                      {authLoading ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <span className={`w-4 h-4 border-2 rounded-full animate-spin ${highlighted ? "border-blue-200/40 border-t-blue-600" : "border-white/30 border-t-white"}`} />
                          Loading…
                        </span>
                      ) : (
                        `Get ${baseTier}`
                      )}
                    </button>

                    {/* The 7-day trial is Pro-only and once per account, so it
                        shows as a secondary action rather than a third card. */}
                    {plan.tier === "pro" && trialEligible && (
                      <button
                        onClick={() => openCheckout(plan, true)}
                        className={`w-full font-semibold py-2.5 mt-2.5 rounded-full text-sm transition-all ${
                          highlighted
                            ? "bg-blue-500/40 text-white ring-1 ring-white/30 hover:bg-blue-500/60"
                            : "bg-white text-blue-600 ring-1 ring-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        Or start a 7-day free trial
                      </button>
                    )}

                    {/* ── Guarantee micro-copy ── */}
                    <p className={`text-center text-[11px] mt-2 ${highlighted ? "text-blue-300/80" : "text-gray-400"}`}>
                      ✓ 48-hour money-back guarantee
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Add-on Credit Packs ── */}
        {!plansLoading && packs.length > 0 && (() => {
          return (
            <div className="mt-16">
              <div className="text-center mb-8">
                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                  {hasActivePlan ? "Top-up Credits" : "Optional Add-ons"}
                </span>
                <h3 className="text-2xl font-extrabold text-gray-900">Need extra credits?</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                  {hasActivePlan
                    ? "Top-up anytime — add-on credits stack with your subscription and never expire."
                    : "Bundle any credit pack with your plan at checkout. Add-on credits never expire."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {packs.map(pack => {
                  const checked   = selectedAddons.includes(pack.slug);
                  const isLoading = buyingPack === pack.slug;
                  return (
                    <div
                      key={pack.id}
                      className={`flex flex-col bg-white rounded-xl border-2 shadow-sm transition-all overflow-hidden ${
                        checked
                          ? "border-blue-600 ring-1 ring-blue-600/20 bg-blue-50/20"
                          : "border-gray-200 hover:border-blue-200"
                      }`}
                    >
                      <label className="flex items-start gap-3 p-5 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAddon(pack.slug)}
                          className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm leading-snug">{pack.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{pack.credits} credits · never expire</p>
                          <p className="text-xl font-black text-gray-900 mt-3">{formatMoney(minorUnits(pack, currency), currency)}</p>
                        </div>
                      </label>
                      {hasActivePlan && (
                        <button
                          onClick={() => handleBuyPack(pack)}
                          disabled={!!buyingPack}
                          className="mx-4 mb-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                        >
                          {isLoading ? (
                            <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Buying...</>
                          ) : "Buy Now"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasActivePlan ? (
                <p className="text-center text-sm text-gray-400 mt-5">
                  Click <strong>Buy Now</strong> to top-up instantly, or check a pack and click a plan above to bundle it.
                </p>
              ) : selectedAddons.length > 0 ? (
                <p className="text-center text-sm text-blue-700 font-semibold mt-5 bg-blue-50 border border-blue-100 rounded-lg py-3">
                  {selectedAddons.length} add-on pack{selectedAddons.length > 1 ? "s" : ""} selected —
                  click any plan above to bundle them at checkout.
                </p>
              ) : (
                <p className="text-center text-sm text-gray-400 mt-5">
                  Select any packs above, then click a plan to buy them together in one payment.
                </p>
              )}
            </div>
          );
        })()}

        <p className="text-center mt-10 text-gray-400 text-sm">
          Free tools always free · Subscription credits refill monthly &amp; roll over up to 2× · Add-on credits never expire · Powered by Razorpay
        </p>
      </section>

      {/* ── Credit Calculator ── */}
      {!plansLoading && subs.length > 0 && (() => {
        const result = computeRecommendation(calcSelections, subs, term);
        return (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-gray-100">
            <div className="text-center mb-8">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                Credit calculator
              </span>
              <h2 className="text-3xl font-extrabold text-gray-900">Estimate your monthly usage</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                Pick the models you plan to use and how often — we&apos;ll estimate your monthly credits and recommend a plan.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 space-y-3">
              {calcSelections.map((sel, idx) => {
                const models = sel.kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <select
                      value={sel.kind}
                      onChange={e => updateCalcRow(idx, { kind: e.target.value as "image" | "video" })}
                      className="bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-medium"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <select
                      value={sel.modelId}
                      onChange={e => updateCalcRow(idx, { modelId: e.target.value })}
                      className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-medium"
                    >
                      {models.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={sel.qty}
                      onChange={e => updateCalcRow(idx, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-20 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-medium text-center"
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">per month</span>
                    {calcSelections.length > 1 && (
                      <button onClick={() => removeCalcRow(idx)} className="text-gray-400 hover:text-red-500 p-1" aria-label="Remove">
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button onClick={addCalcRow} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                + Add another model
              </button>
            </div>

            <div className="mt-6 rounded-2xl border-2 border-blue-100 bg-blue-50/40 p-6 text-center">
              <p className="text-sm text-gray-500">Estimated monthly credits</p>
              <p className="text-4xl font-black text-gray-900 mt-1">{result.totalCredits.toLocaleString("en-IN")}</p>

              {result.recommendedPlan ? (
                <p className="text-sm text-gray-700 mt-3">
                  <strong>{TIER_LABEL[result.recommendedPlan.tier!]}</strong> covers your selection
                  ({result.recommendedPlan.monthlyCredits} credits/month).
                </p>
              ) : result.eligibleTiers.length === 0 && calcSelections.some(s => s.qty > 0) ? (
                <p className="text-sm text-amber-700 mt-3">
                  No single plan unlocks every model you picked — check each model&apos;s minimum plan above and choose the highest one to unlock everything.
                </p>
              ) : calcSelections.some(s => s.qty > 0) ? (
                <p className="text-sm text-amber-700 mt-3">
                  Even Studio&apos;s monthly allowance may be short for this much usage — consider a top-up pack alongside your plan.
                </p>
              ) : (
                <p className="text-sm text-gray-400 mt-3">Add a model and quantity above to see an estimate.</p>
              )}
            </div>
          </section>
        );
      })()}

      {/* ── Checkout Modal ── */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !checkoutLoading && setCheckoutPlan(null)}
          />

          {/* Card */}
          <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Close */}
            <button
              onClick={() => !checkoutLoading && setCheckoutPlan(null)}
              disabled={checkoutLoading}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-40"
              aria-label="Close"
            >
              <XIcon className="w-5 h-5" />
            </button>

            {/* 2-column body */}
            <div className="flex flex-col md:flex-row overflow-y-auto flex-1 min-h-0">

              {/* LEFT: plan info + add-ons */}
              <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
                {/* Selected plan card */}
                <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Selected Plan</p>
                  <p className="font-extrabold text-gray-900 text-lg leading-snug">{checkoutPlan.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{checkoutPlan.monthlyCredits} credits / month</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">
                    {formatMoney(minorUnits(checkoutPlan, currency), currency)}
                    <span className="text-sm font-normal text-gray-400 ml-1">
                      {checkoutPlan.intervalMonths && checkoutPlan.intervalMonths > 1
                        ? `/ ${checkoutPlan.intervalMonths} months`
                        : "/ month"}
                    </span>
                  </p>
                </div>

                {/* Renewal warning for already-subscribed users */}
                {hasActivePlan && !renewalWarningDismissed && user?.subscriptionEndsAt && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5">
                      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">You already have an active plan</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Buying now will <strong>reset</strong> your subscription to {checkoutPlan?.intervalMonths && checkoutPlan.intervalMonths > 1 ? `${checkoutPlan.intervalMonths} months` : "1 month"} from today — not extend your current plan (active until {new Date(user.subscriptionEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).
                      </p>
                    </div>
                    <button onClick={() => setRenewalWarningDismissed(true)} className="text-amber-500 hover:text-amber-700 flex-shrink-0 ml-1">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Add-on packs */}
                {packs.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gray-200" />
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                        Bundle Add-ons
                      </p>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>

                    <div className="space-y-3">
                      {packs.map(pack => {
                        const checked = selectedAddons.includes(pack.slug);
                        return (
                          <label
                            key={pack.id}
                            className={`flex items-start gap-3 p-4 bg-white rounded-xl border-2 cursor-pointer transition-all ${
                              checked
                                ? "border-blue-600 shadow-sm bg-blue-50/20"
                                : "border-gray-100 hover:border-gray-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAddon(pack.slug)}
                              className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm">{pack.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{pack.credits} credits · never expire</p>
                            </div>
                            <p className="font-bold text-gray-900 whitespace-nowrap">
                              {formatMoney(minorUnits(pack, currency), currency)}
                            </p>
                          </label>
                        );
                      })}
                    </div>

                    {selectedAddons.length === 0 && (
                      <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg py-2.5 px-3 text-center">
                        <p className="text-xs text-amber-700 font-medium">
                          💡 Add credits now and use them throughout your subscription!
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* RIGHT: order summary */}
              <div className="w-full md:w-72 p-8 flex flex-col border-t md:border-t-0 md:border-l border-gray-100 flex-shrink-0">
                <h3 className="font-bold text-gray-900 text-lg mb-5">Order Summary</h3>

                <div className="flex-1 space-y-4 min-h-0">
                  {/* Base plan */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{checkoutPlan.name}</p>
                      <p className="text-xs text-gray-400">Subscription plan</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {formatMoney(minorUnits(checkoutPlan, currency), currency)}
                    </p>
                  </div>

                  {/* Selected add-ons */}
                  {selectedAddons.map(slug => {
                    const pack = packs.find(p => p.slug === slug);
                    if (!pack) return null;
                    return (
                      <div key={slug} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{pack.name}</p>
                          <p className="text-xs text-gray-400">{pack.credits} credits · add-on</p>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatMoney(minorUnits(pack, currency), currency)}
                        </p>
                      </div>
                    );
                  })}

                  {selectedAddons.length === 0 && packs.length > 0 && (
                    <p className="text-xs text-gray-400 italic">No add-ons selected yet.</p>
                  )}

                  {/* Coupon — INR only; see couponsAvailable. */}
                  {couponsAvailable && (
                  <div className="border-t border-gray-100 pt-4">
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-green-700 truncate">🎟 {appliedCoupon.code} applied</p>
                          <p className="text-[11px] text-green-600">{appliedCoupon.label}</p>
                        </div>
                        <button onClick={clearCoupon} className="text-xs text-green-700 hover:text-green-900 underline flex-shrink-0">Remove</button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex gap-2">
                          <input
                            value={couponInput}
                            onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                            placeholder="Coupon code"
                            className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={applyCoupon}
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

                  {/* Total */}
                  <div className="border-t border-gray-100 pt-4 mt-2">
                    {couponsAvailable && appliedCoupon && appliedCoupon.discountInPaise > 0 && (
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
                      <p className="font-bold text-gray-900">{checkoutTrial ? "Due today" : "Total Due"}</p>
                      <p className="text-xl font-black text-gray-900">
                        {checkoutTrial ? formatMoney(0, currency) : formatMoney(discountedTotalMinor, currency)}
                      </p>
                    </div>
                    {checkoutTrial && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        Free for 7 days, then {formatMoney(discountedTotalMinor, currency)}. Cancel any time before it ends.
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Secure payment via Razorpay</p>
                  </div>
                </div>

                <button
                  onClick={handlePay}
                  disabled={checkoutLoading}
                  className="mt-6 w-full bg-blue-600 text-white font-bold py-3.5 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                >
                  {checkoutLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Pay with Razorpay →"
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">
                  By continuing, you agree to our{" "}
                  <Link href="/terms" className="underline hover:text-gray-600">Terms of Service</Link>
                </p>
                <p className="text-xs text-gray-400 text-center mt-1">
                  48-hour money-back guarantee ·{" "}
                  <Link href="/refund" className="underline hover:text-gray-600">Refund Policy</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── What each feature costs (live credit costs) ── */}
      {toolCosts.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-gray-100">
          <div className="text-center mb-10">
            <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
              Credit costs
            </span>
            <h2 className="text-3xl font-extrabold text-gray-900">What each feature costs</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
              Every plan shares one credit balance. Spend it on whatever you need — here&apos;s what each tool costs per use.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(showAllCosts ? toolCosts : toolCosts.slice(0, 6)).map(t => (
              <div key={t.slug} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.label}</p>
                  {t.service && <p className="text-[11px] text-gray-400 truncate">{t.service}</p>}
                </div>
                <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                  t.creditCost === 0 ? "bg-green-100 text-green-700" : t.creditCost >= 20 ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700"
                }`}>
                  {t.creditCostMin != null && t.creditCostMax != null && t.creditCostMax > t.creditCostMin
                    ? `${t.creditCostMin}–${t.creditCostMax} credits`
                    : t.creditCost === 0 ? "Free" : `${t.creditCost} ${t.creditCost === 1 ? "credit" : "credits"}`}
                </span>
              </div>
            ))}
          </div>
          {toolCosts.length > 6 && (
            <div className="text-center mt-5">
              <button
                onClick={() => setShowAllCosts(v => !v)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
              >
                {showAllCosts ? "Show less ↑" : `See all ${toolCosts.length} tool costs ↓`}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-gray-400 mt-6">
            Free tools never use credits. Subscription credits refill monthly and roll over up to 2× your allowance. Add-on credits never expire.
          </p>
        </section>
      )}

      {/* ── Feature Comparison Table ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-12">Compare all features</h2>

        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-5 px-6 text-sm font-semibold text-gray-500 w-1/2">Feature</th>
                <th className="text-center py-5 px-4 text-sm font-bold text-gray-900">Creator</th>
                <th className="text-center py-5 px-4 text-sm font-bold text-blue-600 bg-blue-50/50">
                  Pro
                  <span className="block text-xs font-normal text-blue-400">Most popular</span>
                </th>
                <th className="text-center py-5 px-4 text-sm font-bold text-gray-900">Studio</th>
              </tr>
            </thead>

            <tbody>
              <tr className="bg-gray-50">
                <td colSpan={4} className="py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Credits &amp; Perks
                </td>
              </tr>
              <tr className="bg-white border-b border-gray-50">
                <td className="py-4 px-6 text-sm text-gray-700">Credits per month</td>
                {PURCHASABLE_TIER_ORDER.map(t => (
                  <td
                    key={t}
                    className={`text-center py-4 px-4 text-sm font-semibold ${t === "pro" ? "text-blue-600 bg-blue-50/50" : "text-gray-900"}`}
                  >
                    {subs.find(p => p.tier === t && p.intervalMonths === term)?.monthlyCredits ?? "—"}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="py-4 px-6 text-sm text-gray-700">Priority rendering</td>
                <td className="text-center py-4 px-4"><MinusIcon className="w-5 h-5 text-gray-300 mx-auto" /></td>
                <td className="text-center py-4 px-4 bg-blue-50/50"><CheckIcon className="w-5 h-5 text-blue-600 mx-auto" /></td>
                <td className="text-center py-4 px-4"><CheckIcon className="w-5 h-5 text-blue-600 mx-auto" /></td>
              </tr>
              <tr className="bg-white">
                <td className="py-4 px-6 text-sm text-gray-700">Support</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">Email</td>
                <td className="text-center py-4 px-4 text-sm text-blue-700 bg-blue-50/50 font-medium">Priority</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">Dedicated</td>
              </tr>
            </tbody>

            <tbody>
              <tr>
                <td colSpan={4} className="py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-t border-gray-100">
                  Clipiro Workflows
                </td>
              </tr>
              {WORKFLOWS.map((row, i) => (
                <CompareRow key={row.name} feature={row.name} creator={row.creator} pro={row.pro} studio={row.studio} shaded={i % 2 === 0} />
              ))}
            </tbody>

            <tbody>
              <tr>
                <td colSpan={4} className="py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-t border-gray-100">
                  Clipiro AI Tools
                </td>
              </tr>
              {TOOLS.map((row, i) => (
                <CompareRow key={row.name} feature={row.name} creator={row.creator} pro={row.pro} studio={row.studio} shaded={i % 2 === 0} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${openFaq === i ? "border-blue-200 shadow-sm" : "border-gray-100"}`}
            >
              <button
                className="w-full flex items-center justify-between px-6 py-5 text-left"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="font-semibold text-gray-900 text-sm">{faq.q}</span>
                <ChevronDownIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-4 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && (
                <div className="px-6 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">Still have questions?</h2>
          <p className="text-blue-200 mb-8">
            Our support team is available 24/7. Or start free — no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-bold px-8 py-3.5 rounded-full hover:bg-blue-50 transition-colors shadow-lg"
              >
                <ZapIcon className="w-4 h-4" />
                Choose a Plan
              </button>
            ) : (
              <button
                onClick={() => openAuthModal("register")}
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-bold px-8 py-3.5 rounded-full hover:bg-blue-50 transition-colors shadow-lg"
              >
                <ZapIcon className="w-4 h-4" />
                Start Free
              </button>
            )}
            <a
              href="mailto:support@clipiro.com"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-bold px-8 py-3.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
