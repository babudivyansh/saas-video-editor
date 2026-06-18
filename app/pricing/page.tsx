"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

// ── Navbar ─────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-xl text-gray-900">
            <span className="bg-blue-600 text-white rounded-lg w-8 h-8 flex items-center justify-center">
              <ZapIcon className="w-4 h-4" />
            </span>
            Clipiro
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <Link href="/#features" className="hover:text-blue-600 transition-colors">Features</Link>
            <Link href="/#tools" className="hover:text-blue-600 transition-colors">AI Tools</Link>
            <Link href="/pricing" className="text-blue-600 font-semibold">Pricing</Link>
            <Link href="/#faq" className="hover:text-blue-600 transition-colors">FAQ</Link>
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/register" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors">
              <ZapIcon className="w-3.5 h-3.5" />
              Try Free
            </Link>
          </div>
          <button className="md:hidden p-2 text-gray-600" onClick={() => setOpen(!open)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
          {[["/#features", "Features"], ["/#tools", "AI Tools"], ["/pricing", "Pricing"], ["/#faq", "FAQ"]].map(([href, label]) => (
            <Link key={label} href={href} className="block text-sm font-medium text-gray-700 hover:text-blue-600" onClick={() => setOpen(false)}>{label}</Link>
          ))}
          <Link href="/register" className="flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full" onClick={() => setOpen(false)}>
            <ZapIcon className="w-3.5 h-3.5" /> Try Free
          </Link>
        </div>
      )}
    </header>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────
// Credit packs are one-time purchases loaded from the DB (/api/plans), which is
// the single source of truth shared with checkout and the admin pricing editor.
interface DbPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  currency: string;
  credits: number;
  features: string[];
}

// Workflow comparison
const WORKFLOWS = [
  { name: "Faceless Story Videos", starter: true, creator: true, studio: true },
  { name: "Reddit Story Videos", starter: true, creator: true, studio: true },
  { name: "Fake Texts Videos", starter: false, creator: true, studio: true },
  { name: "Streamer Highlight Videos", starter: false, creator: true, studio: true },
  { name: "Podcast Clip Videos", starter: false, creator: false, studio: true },
];

// Tools comparison
const TOOLS = [
  { name: "AI Voiceover (120+ voices)", starter: true, creator: true, studio: true },
  { name: "Karaoke Captions", starter: true, creator: true, studio: true },
  { name: "AI Image Generator", starter: false, creator: true, studio: true },
  { name: "AI Video Generator", starter: false, creator: true, studio: true },
  { name: "Vocal Remover", starter: false, creator: true, studio: true },
  { name: "Background Remover", starter: false, creator: false, studio: true },
  { name: "Auto Subtitle Export", starter: true, creator: true, studio: true },
  { name: "API Access", starter: false, creator: false, studio: true },
];

// FAQ
const FAQS = [
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, you can cancel at any time from your account settings. You will retain access to your plan until the end of your current billing period. No cancellation fees.",
  },
  {
    q: "What is a video credit?",
    a: "One video credit = one generated video. Credits reset monthly on your billing date. Unused credits do not roll over to the next month.",
  },
  {
    q: "How long can each video be?",
    a: "Videos can be up to 3 minutes long on Starter, up to 5 minutes on Creator, and up to 10 minutes on Studio.",
  },
  {
    q: "Is the annual plan really cheaper?",
    a: "Yes — annual billing saves you 30% compared to monthly billing. The discount is applied immediately and you are billed once for the full year.",
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
    q: "Is there a free trial?",
    a: "Yes — every new account gets 30 free credits to try Clipiro before purchasing any plan. No credit card required.",
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

  useEffect(() => {
    fetch("/api/plans")
      .then(res => (res.ok ? res.json() : { plans: [] }))
      .then((data: { plans: DbPlan[] }) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="pt-16 pb-4 text-center px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">
          Start free with 30 credits. Buy a credit pack when you&apos;re ready. No subscription, no hidden fees.
        </p>
      </section>

      {/* ── Pricing Cards ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {plansLoading ? (
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-2xl p-8 border-2 border-gray-100 bg-white animate-pulse h-96" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">Pricing is being updated. Please check back shortly.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, idx) => {
              // Highlight the middle pack as "most popular".
              const highlighted = plans.length === 3 ? idx === 1 : idx === Math.floor(plans.length / 2);
              const price = Math.round(plan.priceInPaise / 100);
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
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-4xl font-black">₹{price.toLocaleString("en-IN")}</span>
                      <span className={`text-sm mb-1.5 ${highlighted ? "text-blue-200" : "text-gray-400"}`}>one-time</span>
                    </div>
                    <p className={`text-sm mt-2 ${highlighted ? "text-blue-100" : "text-gray-500"}`}>
                      {plan.credits} video credits · ₹{(price / plan.credits).toFixed(1)} per video
                    </p>
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
                    Get {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center mt-6 text-gray-400 text-sm">
          Every account starts with 30 free credits · One-time purchase · Powered by Razorpay
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
                <th className="text-center py-5 px-4 text-sm font-bold text-gray-900">Starter</th>
                <th className="text-center py-5 px-4 text-sm font-bold text-blue-600 bg-blue-50/50">
                  Creator
                  <span className="block text-xs font-normal text-blue-400">Most popular</span>
                </th>
                <th className="text-center py-5 px-4 text-sm font-bold text-gray-900">Studio</th>
              </tr>
            </thead>

            {/* Credits row */}
            <tbody>
              <tr className="bg-gray-50">
                <td colSpan={4} className="py-3 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Monthly Credits
                </td>
              </tr>
              <tr className="bg-white border-b border-gray-50">
                <td className="py-4 px-6 text-sm text-gray-700">Video credits per month</td>
                <td className="text-center py-4 px-4 text-sm font-semibold text-gray-900">60</td>
                <td className="text-center py-4 px-4 text-sm font-semibold text-blue-600 bg-blue-50/50">180</td>
                <td className="text-center py-4 px-4 text-sm font-semibold text-gray-900">600</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-4 px-6 text-sm text-gray-700">Max video length</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">3 min</td>
                <td className="text-center py-4 px-4 text-sm text-blue-700 bg-blue-50/50 font-medium">5 min</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">10 min</td>
              </tr>
              <tr className="bg-white">
                <td className="py-4 px-6 text-sm text-gray-700">Export quality</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">1080p</td>
                <td className="text-center py-4 px-4 text-sm text-blue-700 bg-blue-50/50 font-medium">4K</td>
                <td className="text-center py-4 px-4 text-sm text-gray-700">4K</td>
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
              Start Free — 30 Credits
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
