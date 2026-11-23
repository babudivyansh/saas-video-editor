"use client";

// Diwali Launch Offer box above the plan cards on /pricing (mockup 5). During
// launch week; the yearly line only once its Razorpay offer is set. Each line
// switches the page to the billing term it applies to.

import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Marquee, OFFER_COPY, Toran, diwaliStyles as s, useDiwaliOffers } from "./DiwaliDecor";

export default function PricingOfferRibbon({ term, onTerm, currency }: { term: number; onTerm: (t: number) => void; currency: "INR" | "USD" }) {
  const { phase, monthly, yearly } = useDiwaliOffers();
  if (phase !== "live") return null;

  const ticker = [
    "✦ Happy Diwali",
    "✦ Launched 8 Nov 2026",
    ...(monthly ? [`✦ ${OFFER_COPY.monthlyShort}`] : []),
    ...(yearly ? [`✦ ${OFFER_COPY.yearlyShort}`] : []),
    `✦ Ends ${DIWALI.endLabel}`,
  ];
  const row = [...ticker, ...ticker, ...ticker, ...ticker];

  const pill = (active: boolean) =>
    `h-11 rounded-xl px-4 text-sm font-bold transition-colors ${active ? "bg-[#0d2a1d] text-[#20d68a]" : "bg-[#00a968] text-[#021a10] hover:bg-[#20d68a]"}`;

  return (
    <section aria-label="Diwali pricing offer" className="mx-auto mt-8 w-full max-w-[80rem] px-4 md:px-10">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#5a4614] bg-[#110d05] font-sans text-[#eef5f1]">
        <Toran className="h-4" />
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-7">
          <Diya size={52} className="hidden sm:block" />
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="m-0 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
              The <span className={`${s.serif} text-[26px] text-[#ffd23f] sm:text-[28px]`}>Diwali Launch Offer</span>
            </p>
            {monthly && <p className="m-0 text-[15px] font-semibold text-[#eef5f1]">{OFFER_COPY.monthly}</p>}
            {yearly && (
              <p className="m-0 text-[15px] font-semibold text-[#eef5f1]">
                {OFFER_COPY.yearly}
                {currency === "USD" ? <span className="font-normal text-[#c9b98f]"> (INR checkout)</span> : null}
              </p>
            )}
            <p className="m-0 text-sm text-[#c9b98f]">Applied automatically · no code needed · ends {DIWALI.endLabel}</p>
          </div>
          <div role="group" aria-label="Show prices for" className="flex flex-wrap gap-2 self-start sm:self-auto">
            {monthly && (
              <button type="button" aria-pressed={term === 1} onClick={() => onTerm(1)} className={pill(term === 1)}>
                Monthly
              </button>
            )}
            {yearly && (
              <button type="button" aria-pressed={term === 12} onClick={() => onTerm(12)} className={pill(term === 12)}>
                Yearly · {DIWALI.yearlyPct}% + {DIWALI.extraPct}% off
              </button>
            )}
          </div>
        </div>
        <div className="flex h-[26px] items-center bg-[#ffd23f]">
          <Marquee duration={26}>
            {row.map((t, i) => (
              <span key={i} className="whitespace-nowrap pr-7 text-xs font-extrabold uppercase tracking-[0.1em] text-[#1a0f02]">{t}</span>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
