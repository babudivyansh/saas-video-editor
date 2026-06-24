"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import { useAuth } from "@/app/components/AuthContext";
import { useRazorpayCheckout } from "@/app/components/useRazorpayCheckout";

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
  currency: string;
  credits: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths: number | null;
  monthlyCredits: number | null;
  veo3Included: boolean;
}

interface ToolCost {
  slug: string;
  label: string;
  service: string;
  creditCost: number;
}

const TERMS = [
  { months: 1,  label: "Monthly" },
  { months: 12, label: "Yearly" },
];
const YEARLY_SAVE_PCT = 30; // yearly plans are 30% cheaper than 12× monthly

const TIER_ORDER = ["creator", "pro", "studio"] as const;
function tierOf(slug: string): string | null {
  const m = /^sub_([a-z]+)_/.exec(slug);
  return m ? m[1] : null;
}

const WORKFLOWS = [
  { name: "Reddit Story Videos", starter: true, creator: true, studio: true },
  { name: "Fake Texts Videos", starter: true, creator: true, studio: true },
  { name: "Split-Screen Videos", starter: true, creator: true, studio: true },
  { name: "Streamer Highlight Videos", starter: true, creator: true, studio: true },
  { name: "Text / Faceless Story Videos", starter: true, creator: true, studio: true },
];

const TOOLS = [
  { name: "AI Voiceover (50+ voices)", starter: true, creator: true, studio: true },
  { name: "Karaoke Captions", starter: true, creator: true, studio: true },
  { name: "AI Image Generator", starter: true, creator: true, studio: true },
  { name: "AI Video Generator (Veo3)", starter: true, creator: true, studio: true },
  { name: "AI Vocal Remover", starter: true, creator: true, studio: true },
  { name: "AI Voice Changer", starter: true, creator: true, studio: true },
  { name: "AI Speech Enhancer", starter: true, creator: true, studio: true },
  { name: "AI Brainstormer", starter: true, creator: true, studio: true },
  { name: "Subtitle Remover", starter: true, creator: true, studio: true },
];

const FAQS = [
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, you can cancel at any time from your account settings. You will retain access to your plan until the end of your current billing period. No cancellation fees.",
  },
  {
    q: "What is a credit?",
    a: "Credits are spent on AI tools — the cost depends on the tool (e.g. 1 credit for an image or voiceover, 2 for a video render, 20 for a Veo3 AI video). Subscription credits refill each month and do not roll over.",
  },
  {
    q: "How long can each video be?",
    a: "Videos can be up to 3 minutes long on Starter, up to 5 minutes on Creator, and up to 10 minutes on Studio.",
  },
  {
    q: "Do longer terms cost less?",
    a: "Yes — on Pro and Studio you save 10% / 15% / 20% on 3 / 6 / 12-month terms, and the 6 and 12-month terms bundle Veo3 AI video for free. Creator's 12-month term saves 13%. You're billed once upfront for the full term.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade your plan at any time. Upgrades take effect immediately (with prorated billing); downgrades take effect at the start of your next billing cycle.",
  },
  {
    q: "Do you offer refunds?",
    a: "We offer a 3-day money-back guarantee on your first purchase if you have not used more than 5 credits. Please see our Refund Policy for full details.",
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

// ── CompareRow ─────────────────────────────────────────────────────────────
function CompareRow({ feature, starter, creator, studio, shaded }: {
  feature: string; starter: boolean; creator: boolean; studio: boolean; shaded: boolean;
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
      {cell(starter, false)}
      {cell(creator, true)}
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
  const [toolCosts, setToolCosts] = useState<ToolCost[]>([]);

  // Checkout state
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<DbPlan | null>(null);
  const [successBanner, setSuccessBanner] = useState(false);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);

  // Coupon state (scoped to the checkout modal)
  const [couponInput, setCouponInput] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; discountInPaise: number } | null>(null);

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

  // True only while the subscription period hasn't lapsed.
  const hasActivePlan =
    !!user?.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date();

  const toggleAddon = (slug: string) => {
    setSelectedAddons(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
    // Cart total changed → invalidate any applied coupon so it re-validates.
    setAppliedCoupon(null);
    setCouponError("");
  };

  const openCheckout = (plan: DbPlan) => {
    setCheckoutPlan(plan);
    setRenewalWarningDismissed(false);
    setCouponInput("");
    setCouponError("");
    setAppliedCoupon(null);
  };

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
      couponCode: appliedCoupon?.code,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
    });
  };

  const handleBuyPack = (pack: DbPlan) => {
    startCheckout({
      planId: pack.slug,
      onSuccess: () => { window.location.href = "/pricing?success=1"; },
    });
  };

  const totalDue =
    (checkoutPlan ? Math.round(checkoutPlan.priceInPaise / 100) : 0) +
    selectedAddons.reduce((s, slug) => {
      const pack = packs.find(p => p.slug === slug);
      return s + (pack ? Math.round(pack.priceInPaise / 100) : 0);
    }, 0);

  // Total after any applied coupon discount (₹).
  const discountedTotal = appliedCoupon
    ? Math.max(1, totalDue - Math.round(appliedCoupon.discountInPaise / 100))
    : totalDue;

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
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">
          Free tools are open to everyone. Subscribe to unlock every AI tool — go <span className="font-semibold text-gray-700">yearly to save 30%</span> and get Veo3 AI video free.
        </p>
      </section>

      {/* ── Pricing Cards ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Term toggle */}
        <div className="flex justify-center mb-10">
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
        </div>

        {plansLoading ? (
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-2xl p-8 border-2 border-gray-100 bg-white animate-pulse h-96" />
            ))}
          </div>
        ) : (() => {
          const cards = TIER_ORDER
            .map(tier => subs.find(p => tierOf(p.slug) === tier && p.intervalMonths === term))
            .filter((p): p is DbPlan => !!p);

          if (cards.length === 0) {
            return (
              <p className="text-center text-gray-400 text-sm py-12">
                Pricing is being updated. Please check back shortly.
              </p>
            );
          }

          return (
            <div className="grid md:grid-cols-3 gap-6 items-start">
              {cards.map((plan, idx) => {
                const highlighted = idx === 1;
                const price    = Math.round(plan.priceInPaise / 100);
                const months   = plan.intervalMonths ?? 1;
                const perMonth = Math.round(price / months);
                const baseTier = plan.name.replace(/\s*\(.*\)$/, "");
                // For yearly, find the matching monthly plan to show savings.
                const monthlyPlan = months > 1
                  ? subs.find(p => tierOf(p.slug) === tierOf(plan.slug) && p.intervalMonths === 1)
                  : null;
                const monthlyEquiv = monthlyPlan ? Math.round(monthlyPlan.priceInPaise / 100) : null;
                const fullYear = monthlyEquiv ? monthlyEquiv * 12 : null;
                const saved = fullYear ? fullYear - price : null;
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-8 border-2 flex flex-col ${
                      highlighted
                        ? "border-blue-600 bg-blue-600 text-white shadow-2xl md:scale-105"
                        : "border-gray-100 bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {highlighted && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="bg-green-400 text-green-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="mb-6">
                      <p className={`text-sm font-bold uppercase tracking-widest mb-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                        {baseTier}
                      </p>
                      <div className="flex items-end gap-1.5 mb-1">
                        <span className="text-4xl font-black">₹{perMonth.toLocaleString("en-IN")}</span>
                        <span className={`text-sm mb-1.5 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>/mo</span>
                        {months > 1 && monthlyEquiv && (
                          <span className={`text-sm mb-1.5 line-through ${highlighted ? "text-blue-300/70" : "text-gray-300"}`}>
                            ₹{monthlyEquiv.toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mt-2 ${highlighted ? "text-blue-100" : "text-gray-500"}`}>
                        {plan.monthlyCredits} credits / month
                        {months > 1 && <> · ₹{price.toLocaleString("en-IN")} billed yearly</>}
                      </p>
                      {months > 1 && saved && saved > 0 && (
                        <p className={`text-xs font-bold mt-1 ${highlighted ? "text-green-300" : "text-green-600"}`}>
                          Save ₹{saved.toLocaleString("en-IN")} a year ({YEARLY_SAVE_PCT}% off)
                        </p>
                      )}
                      {plan.monthlyCredits != null && (
                        <p className={`text-xs mt-1 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>
                          ≈ {plan.monthlyCredits} images, {Math.floor(plan.monthlyCredits / 2)} video renders, or {Math.floor(plan.monthlyCredits / 20)} Veo3 videos
                        </p>
                      )}
                      {plan.veo3Included && (
                        <span className={`inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded-full ${highlighted ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                          ✦ Veo3 AI video included
                        </span>
                      )}
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((f) => (
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
                      className={`w-full font-bold py-3 rounded-full transition-all disabled:opacity-60 disabled:cursor-wait ${
                        highlighted
                          ? "bg-white text-blue-600 hover:bg-blue-50"
                          : "bg-blue-600 text-white hover:bg-blue-700"
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
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Add-on Credit Packs ── */}
        {!plansLoading && packs.length > 0 && (
          <div className="mt-16">
            <div className="text-center mb-8">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                {hasActivePlan ? "Top-up Credits" : "Optional Add-ons"}
              </span>
              <h3 className="text-2xl font-extrabold text-gray-900">Boost your credits</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                {hasActivePlan
                  ? "You have an active plan — buy any credit pack instantly. Credits never expire."
                  : "Select any packs to bundle with your plan purchase. Credits never expire and roll over forever."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {packs.map(pack => {
                const checked   = selectedAddons.includes(pack.slug);
                const price     = Math.round(pack.priceInPaise / 100);
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
                    {/* Checkbox row — always shown (for bundling with a plan) */}
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
                        <p className="text-xl font-black text-gray-900 mt-3">₹{price.toLocaleString("en-IN")}</p>
                      </div>
                    </label>

                    {/* Buy Now — only for active subscribers */}
                    {hasActivePlan && (
                      <button
                        onClick={() => handleBuyPack(pack)}
                        disabled={!!buyingPack}
                        className="mx-4 mb-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        {isLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Buying...
                          </>
                        ) : (
                          "Buy Now"
                        )}
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
        )}

        <p className="text-center mt-10 text-gray-400 text-sm">
          Free tools are always free · Longer terms include Veo3 · Powered by Razorpay
        </p>
      </section>

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
                    ₹{Math.round(checkoutPlan.priceInPaise / 100).toLocaleString("en-IN")}
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
                        const price   = Math.round(pack.priceInPaise / 100);
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
                              ₹{price.toLocaleString("en-IN")}
                            </p>
                          </label>
                        );
                      })}
                    </div>

                    {selectedAddons.length === 0 && (
                      <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg py-2.5 px-3 text-center">
                        <p className="text-xs text-amber-700 font-medium">
                          💡 Add credits now — they never expire and save you more later!
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
                      ₹{Math.round(checkoutPlan.priceInPaise / 100).toLocaleString("en-IN")}
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
                          ₹{Math.round(pack.priceInPaise / 100).toLocaleString("en-IN")}
                        </p>
                      </div>
                    );
                  })}

                  {selectedAddons.length === 0 && packs.length > 0 && (
                    <p className="text-xs text-gray-400 italic">No add-ons selected yet.</p>
                  )}

                  {/* Coupon */}
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

                  {/* Total */}
                  <div className="border-t border-gray-100 pt-4 mt-2">
                    {appliedCoupon && appliedCoupon.discountInPaise > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="text-gray-500">₹{totalDue.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-green-600 font-medium">Discount ({appliedCoupon.code})</span>
                          <span className="text-green-600 font-medium">−₹{Math.round(appliedCoupon.discountInPaise / 100).toLocaleString("en-IN")}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="font-bold text-gray-900">Total Due</p>
                      <p className="text-xl font-black text-gray-900">
                        ₹{discountedTotal.toLocaleString("en-IN")}
                      </p>
                    </div>
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
            {toolCosts.map(t => (
              <div key={t.slug} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.label}</p>
                  {t.service && <p className="text-[11px] text-gray-400 truncate">{t.service}</p>}
                </div>
                <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                  t.creditCost === 0 ? "bg-green-100 text-green-700" : t.creditCost >= 20 ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700"
                }`}>
                  {t.creditCost === 0 ? "Free" : `${t.creditCost} ${t.creditCost === 1 ? "credit" : "credits"}`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">
            Free tools never use credits. Credits refill monthly on subscriptions and never expire on top-ups.
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
                <td className="text-center py-4 px-4 text-sm font-semibold text-gray-900">45</td>
                <td className="text-center py-4 px-4 text-sm font-semibold text-blue-600 bg-blue-50/50">130</td>
                <td className="text-center py-4 px-4 text-sm font-semibold text-gray-900">320</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-4 px-6 text-sm text-gray-700">Priority rendering</td>
                <td className="text-center py-4 px-4"><MinusIcon className="w-5 h-5 text-gray-300 mx-auto" /></td>
                <td className="text-center py-4 px-4 bg-blue-50/50"><CheckIcon className="w-5 h-5 text-blue-600 mx-auto" /></td>
                <td className="text-center py-4 px-4"><CheckIcon className="w-5 h-5 text-blue-600 mx-auto" /></td>
              </tr>
              <tr className="bg-white">
                <td className="py-4 px-6 text-sm text-gray-700">Veo3 AI video included</td>
                <td className="text-center py-4 px-4 text-xs text-gray-500">6mo+</td>
                <td className="text-center py-4 px-4 text-xs text-blue-700 bg-blue-50/50 font-medium">6mo+</td>
                <td className="text-center py-4 px-4 text-xs text-gray-500">3mo+</td>
              </tr>
              <tr className="bg-gray-50">
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
                <CompareRow key={row.name} feature={row.name} starter={row.starter} creator={row.creator} studio={row.studio} shaded={i % 2 === 0} />
              ))}
            </tbody>

            <tbody>
              <tr>
                <td colSpan={4} className="py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-t border-gray-100">
                  Clipiro AI Tools
                </td>
              </tr>
              {TOOLS.map((row, i) => (
                <CompareRow key={row.name} feature={row.name} starter={row.starter} creator={row.creator} studio={row.studio} shaded={i % 2 === 0} />
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
              href="mailto:support@clipiro.ai"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-bold px-8 py-3.5 rounded-full hover:bg-white/10 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-black text-gray-900 text-lg">
            <span className="bg-blue-600 text-white rounded-lg w-7 h-7 flex items-center justify-center">
              <ZapIcon className="w-3.5 h-3.5" />
            </span>
            CLIPIRO
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/refund" className="hover:text-gray-700">Refund</Link>
            <Link href="/affiliate-tos" className="hover:text-gray-700">Affiliate TOS</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
