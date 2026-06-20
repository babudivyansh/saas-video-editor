"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";

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

// Navbar moved to app/components/SiteNavbar.tsx (shared across home, pricing,
// billing, and legal pages).

// ── Data ───────────────────────────────────────────────────────────────────
// Plans are loaded from the DB (/api/plans), the single source of truth shared
// with checkout and the admin pricing editor. kind = subscription | pack | addon.
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

const TERMS = [
  { months: 1,  label: "Monthly" },
  { months: 3,  label: "3 Months" },
  { months: 6,  label: "6 Months" },
  { months: 12, label: "12 Months" },
];

// Tier display order + the slug prefix used in the DB (sub_<tier>_<n>mo).
const TIER_ORDER = ["creator", "pro", "studio"] as const;
function tierOf(slug: string): string | null {
  const m = /^sub_([a-z]+)_/.exec(slug);
  return m ? m[1] : null;
}

// Every workflow and tool is included on every paid plan — tiers differ only by
// monthly credits and perks (see PERKS below). All entries are `true` on purpose.
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

// FAQ
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [term, setTerm] = useState(1);

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <SiteNavbar solid />

      {/* ── Hero ── */}
      <section className="pt-16 pb-4 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">
          Free tools are open to everyone. Subscribe to a plan to unlock the AI tools — longer terms save more and bundle Veo3 AI video.
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
                className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  term === t.months ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
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
          // Resolve one subscription card per tier for the selected term.
          const subs = plans.filter(p => p.kind === "subscription");
          const cards = TIER_ORDER
            .map(tier => subs.find(p => tierOf(p.slug) === tier && p.intervalMonths === term))
            .filter((p): p is DbPlan => !!p);

          if (cards.length === 0) {
            return <p className="text-center text-gray-400 text-sm py-12">Pricing is being updated. Please check back shortly.</p>;
          }

          return (
            <div className="grid md:grid-cols-3 gap-6 items-start">
              {cards.map((plan, idx) => {
                const highlighted = idx === 1; // Pro
                const price = Math.round(plan.priceInPaise / 100);
                const months = plan.intervalMonths ?? 1;
                const perMonth = Math.round(price / months);
                const baseTier = plan.name.replace(/\s*\(.*\)$/, "");
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
                      <div className="flex items-end gap-1 mb-1">
                        <span className="text-4xl font-black">₹{perMonth.toLocaleString("en-IN")}</span>
                        <span className={`text-sm mb-1.5 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>/mo</span>
                      </div>
                      <p className={`text-sm mt-2 ${highlighted ? "text-blue-100" : "text-gray-500"}`}>
                        {plan.monthlyCredits} credits / month
                        {months > 1 && <> · ₹{price.toLocaleString("en-IN")} billed for {months} months</>}
                      </p>
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

                    <Link
                      href="/register"
                      className={`block text-center font-bold py-3 rounded-full transition-all ${
                        highlighted
                          ? "bg-white text-blue-600 hover:bg-blue-50"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      Get {baseTier}
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Top-up packs (subscriber-only) */}
        {!plansLoading && plans.some(p => p.kind === "pack") && (
          <div className="mt-14">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Need more credits? Top-up packs</h3>
              <p className="text-sm text-gray-500">One-time, never expire. Available to active subscribers.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {plans.filter(p => p.kind === "pack").map(pack => {
                const price = Math.round(pack.priceInPaise / 100);
                return (
                  <div key={pack.id} className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
                    <p className="text-sm font-bold text-gray-900">{pack.name}</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">₹{price.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-gray-500 mt-1">{pack.credits} credits</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center mt-8 text-gray-400 text-sm">
          Free tools are always free · Longer terms include Veo3 · Powered by Razorpay
        </p>
      </section>

      {/* ── Feature Comparison Table ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-12">Compare all features</h2>

        {/* Table header */}
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

            {/* Credits + perks (what actually differs between tiers) */}
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

            {/* Workflows section */}
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

            {/* Tools section */}
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
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-bold px-8 py-3.5 rounded-full hover:bg-blue-50 transition-colors shadow-lg"
            >
              <ZapIcon className="w-4 h-4" />
              Start Free
            </Link>
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
