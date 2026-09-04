import type { Metadata } from "next";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import AffiliateCTA from "@/app/components/AffiliateCTA";
import AffiliateFAQ from "@/app/components/AffiliateFAQ";

export const metadata: Metadata = {
  title: "Affiliate Program",
  description:
    "Earn 20% commission for every creator you bring to Clipiro. Share your link, get your friends clipping, and get paid.",
  openGraph: {
    title: "Clipiro Affiliate Program",
    description: "Earn 20% commission for every creator you bring to Clipiro.",
  },
};

const BENEFITS = [
  { value: "20%", label: "Commission per referral" },
  { value: "30 days", label: "Referral tracking window" },
  { value: "₹500", label: "Minimum payout" },
  { value: "On request", label: "Payout schedule" },
];

const STEPS = [
  {
    num: "1",
    title: "Get your link",
    desc: "Sign up and grab your unique referral link from your affiliate dashboard — no approval wait for your first link.",
  },
  {
    num: "2",
    title: "Share it anywhere",
    desc: "Post it on your website, social channels, newsletter, or in a review — anywhere your audience already trusts you.",
  },
  {
    num: "3",
    title: "Earn 20%",
    desc: "When someone you referred makes their first payment on Clipiro, you automatically earn 20% commission (up to ₹2,000 per referral). No limit on how many people you can refer.",
  },
];

const REQUIREMENTS = [
  { title: "An active Clipiro account", desc: "You need a Clipiro account in good standing before you can apply." },
  { title: "A real audience", desc: "A website, blog, social channel, or newsletter with original content and a genuine following." },
  { title: "18 years or older", desc: "Affiliates must meet the minimum age requirement in their jurisdiction." },
  { title: "Honest promotion", desc: "Comply with local advertising laws and clearly disclose your affiliate relationship with Clipiro." },
];

const DOS = [
  "Your own website, blog, or YouTube/Instagram content",
  "Opted-in email newsletters to your own subscriber list",
  "Honest reviews, tutorials, or comparison content",
];

const DONTS = [
  "Self-referrals or fake sign-ups to generate commissions",
  "Bidding on “Clipiro” or similar branded keywords in paid search",
  "Spam, cookie stuffing, or impersonating Clipiro's brand",
];

export default function AffiliateProgramPage() {
  return (
    <MarketingShell>
        {/* Hero */}
        <section className="border-b border-card-border bg-surface">
          <div className="mx-auto w-full max-w-screen-xl px-5 py-12 text-center sm:px-6 md:px-12 md:py-16 lg:px-20">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">Affiliate Program</span>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
              Earn 20% for every creator you bring to Clipiro
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
              Share your referral link with your audience. When they start creating with Clipiro, you get paid —
              automatically, every month.
            </p>
            <div className="mt-8">
              <AffiliateCTA />
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 py-16 md:px-12 lg:px-20">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {BENEFITS.map((b) => (
              <div key={b.label} className="rounded-2xl border border-brand-soft bg-panel p-6 text-center">
                <p className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{b.value}</p>
                <p className="mt-1 text-sm text-ink-soft">{b.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 pb-8 md:px-12 lg:px-20">
          <div className="text-center">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">How it works</span>
            <h2 className="mx-auto mt-3 max-w-xl text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]">
              Three steps to your first payout
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="rounded-2xl border border-card-border bg-panel p-7 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-sm font-semibold text-brand-deep">
                  {s.num}
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 py-16 md:px-12 lg:px-20">
          <div className="text-center">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">Requirements</span>
            <h2 className="mx-auto mt-3 max-w-xl text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]">
              What you need to join
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">
              Applications are reviewed and approved at Clipiro&apos;s discretion, usually within a few business days.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {REQUIREMENTS.map((r) => (
              <div key={r.title} className="flex gap-4 rounded-2xl border border-card-border bg-panel p-6 shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-deep">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <h3 className="text-base font-bold text-ink">{r.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Do's and don'ts */}
        <section className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 pb-16 md:px-12 lg:px-20">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-card-border bg-panel p-7 shadow-sm">
              <h3 className="text-base font-bold text-ink">Approved promotion</h3>
              <ul className="mt-4 space-y-3">
                {DOS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-card-border bg-panel p-7 shadow-sm">
              <h3 className="text-base font-bold text-ink">Not allowed</h3>
              <ul className="mt-4 space-y-3">
                {DONTS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-error" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft">
            See the full{" "}
            <a href="/affiliate-tos" className="font-semibold text-brand-deep hover:underline">
              Affiliate Terms of Service
            </a>{" "}
            for the complete rules, obligations, and payment terms.
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-surface">
          <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 py-16 md:px-12 lg:px-20">
            <div className="text-center">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand">FAQ</span>
              <h2 className="mt-3 text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]">Frequently asked questions</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">
                Everything you need to know about the Clipiro Affiliate Program.
              </p>
            </div>
            <AffiliateFAQ />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-screen-xl px-5 sm:px-6 py-20 text-center md:px-12 lg:px-20">
          <h2 className="mx-auto max-w-xl text-[22px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[26px] lg:text-[28px]">
            Ready to start earning?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-ink-soft">
            Join creators already earning with Clipiro. It takes less than a minute to get your link.
          </p>
          <div className="mt-8">
            <AffiliateCTA />
          </div>
        </section>
    </MarketingShell>
  );
}
