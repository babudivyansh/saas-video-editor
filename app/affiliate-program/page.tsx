import type { Metadata } from "next";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import AffiliateCTA from "@/app/components/AffiliateCTA";
import AffiliateFAQ from "@/app/components/AffiliateFAQ";

export const metadata: Metadata = {
  title: "Affiliate Program",
  description:
    "Earn 20% commission for every creator you bring to Clipiro. Share your link, get your friends clipping, and get paid every month.",
  openGraph: {
    title: "Clipiro Affiliate Program",
    description: "Earn 20% commission for every creator you bring to Clipiro.",
  },
};

const BENEFITS = [
  { value: "20%", label: "Commission per referral" },
  { value: "30 days", label: "Referral tracking window" },
  { value: "₹500", label: "Minimum payout" },
  { value: "Monthly", label: "Payout schedule" },
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
    desc: "When someone you referred makes their first payment on Clipiro, you automatically earn 20% commission. No limits.",
  },
];

const REQUIREMENTS = [
  { title: "An active Clipiro account", desc: "You need a Clipiro account in good standing before you can apply." },
  { title: "A real audience", desc: "A website, blog, social channel, or newsletter with original content and a genuine following." },
  { title: "18 years or older", desc: "Affiliates must meet the minimum age requirement in their jurisdiction." },
  { title: "Honest promotion", desc: "Comply with local advertising laws and clearly disclose your affiliate relationship with Clipiro." },
];

const DOS = [
  "Your own website, blog, or YouTube/TikTok/Instagram content",
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
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main>
        {/* Hero */}
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px] lg:py-28">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">Affiliate Program</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-gray-900 md:text-6xl">
              Earn 20% for every creator you bring to Clipiro
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Share your referral link with your audience. When they start creating with Clipiro, you get paid —
              automatically, every month.
            </p>
            <div className="mt-8">
              <AffiliateCTA />
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {BENEFITS.map((b) => (
              <div key={b.label} className="rounded-2xl border border-brand-soft bg-white p-6 text-center">
                <p className="text-3xl font-black text-gray-900 md:text-4xl">{b.value}</p>
                <p className="mt-1 text-sm text-gray-500">{b.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 pb-8 md:px-12 lg:px-[120px]">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">How it works</span>
            <h2 className="mx-auto mt-3 max-w-xl text-3xl font-extrabold text-gray-900 md:text-4xl">
              Three steps to your first payout
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-sm font-extrabold text-brand-deep">
                  {s.num}
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">Requirements</span>
            <h2 className="mx-auto mt-3 max-w-xl text-3xl font-extrabold text-gray-900 md:text-4xl">
              What you need to join
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Applications are reviewed and approved at Clipiro&apos;s discretion, usually within a few business days.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {REQUIREMENTS.map((r) => (
              <div key={r.title} className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-deep">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{r.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Do's and don'ts */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 pb-16 md:px-12 lg:px-[120px]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <h3 className="text-base font-bold text-gray-900">Approved promotion</h3>
              <ul className="mt-4 space-y-3">
                {DOS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-gray-600">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <h3 className="text-base font-bold text-gray-900">Not allowed</h3>
              <ul className="mt-4 space-y-3">
                {DONTS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-gray-600">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">
            See the full{" "}
            <a href="/affiliate-tos" className="font-semibold text-brand-deep hover:underline">
              Affiliate Terms of Service
            </a>{" "}
            for the complete rules, obligations, and payment terms.
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-brand-deep">FAQ</span>
              <h2 className="mt-3 text-3xl font-extrabold text-gray-900 md:text-5xl">Frequently asked questions</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
                Everything you need to know about the Clipiro Affiliate Program.
              </p>
            </div>
            <AffiliateFAQ />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px]">
          <h2 className="mx-auto max-w-xl text-3xl font-extrabold text-gray-900 md:text-4xl">
            Ready to start earning?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600">
            Join creators already earning with Clipiro. It takes less than a minute to get your link.
          </p>
          <div className="mt-8">
            <AffiliateCTA />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
