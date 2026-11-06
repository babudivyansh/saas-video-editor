"use client";

// Diwali ribbon above the plan cards on /pricing (mockup 5). Only while the
// offer is live and really applied at checkout. Its button switches the page
// to yearly prices, where the offer applies.

import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Marquee, Toran, diwaliStyles as s, useDiwaliPhase } from "./DiwaliDecor";

export default function PricingOfferRibbon({ term, onTerm, currency }: { term: number; onTerm: (t: number) => void; currency: "INR" | "USD" }) {
  const { offerLive } = useDiwaliPhase();
  if (!offerLive) return null;

  const ticker = ["✦ Happy Diwali", "✦ Launched 8 Nov 2026", `✦ Extra ${DIWALI.extraPct}% off yearly`, `✦ ${DIWALI.code}`, `✦ Ends ${DIWALI.endLabel}`];
  const row = [...ticker, ...ticker, ...ticker, ...ticker];

  return (
    <section aria-label="Diwali pricing offer" className="mx-auto mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#5a4614] bg-[#110d05] font-sans text-[#eef5f1]">
        <Toran className="h-4" />
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-7">
          <Diya size={52} className="hidden sm:block" />
          <div className="flex flex-1 flex-col gap-1">
            <p className="m-0 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
              Diwali launch offer: <span className={`${s.serif} text-[26px] text-[#ffd23f] sm:text-[28px]`}>extra {DIWALI.extraPct}% off</span> yearly plans
            </p>
            <p className="m-0 text-sm text-[#c9b98f]">
              Stacks on the {DIWALI.yearlyPct}% yearly saving · first yearly payment · applied automatically
              {currency === "USD" ? " on INR checkout" : ""} · ends {DIWALI.endLabel}
            </p>
          </div>
          {term === 12 ? (
            <span className="inline-flex h-11 items-center self-start rounded-xl bg-[#0d2a1d] px-4 text-sm font-bold text-[#20d68a] sm:self-auto">
              Yearly prices shown
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onTerm(12)}
              className="h-11 self-start rounded-xl bg-[#00a968] px-4 text-sm font-bold text-[#021a10] transition-colors hover:bg-[#20d68a] sm:self-auto"
            >
              Show yearly · {DIWALI.yearlyPct}% + {DIWALI.extraPct}% off
            </button>
          )}
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
