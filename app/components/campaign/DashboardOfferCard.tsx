"use client";

// Diwali offer card on dashboard Home, under the AutoClip launch box
// (mockup 4). During launch week; the yearly line only once its Razorpay
// offer is set.

import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Lantern, Marquee, OFFER_COPY, Sparkle, diwaliStyles as s, useDiwaliOffers } from "./DiwaliDecor";

const DIYAS = Array.from({ length: 16 }, (_, i) => i);

export default function DashboardOfferCard() {
  const { phase, monthly, yearly } = useDiwaliOffers();
  const { openBilling } = useBillingOverlay();
  if (phase !== "live") return null;
  const lines = [...(monthly ? [OFFER_COPY.monthly] : []), ...(yearly ? [OFFER_COPY.yearly] : [])];

  return (
    <section
      aria-label="Diwali launch offer"
      className="relative mx-auto flex max-w-[1120px] overflow-hidden rounded-[20px] border border-[#3d3416] bg-[#0b1210] font-sans text-[#eef5f1]"
    >
      <div className="relative z-[1] flex flex-1 flex-col gap-3 p-6 sm:p-7 md:pr-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-[#ffd23f] px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#1a0f02]">Launch week</span>
          <span className="text-[13px] text-[#a9bdb3]">Ends {DIWALI.endLabel}</span>
        </div>
        <h2 className="m-0 text-2xl font-extrabold leading-tight tracking-[-0.025em] sm:text-[30px]">
          Happy Diwali — the <span className={`${s.serif} text-[#ffd23f]`}>Diwali Launch Offer</span>
        </h2>
        <div className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <p key={l} className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[#eef5f1]">
              <Diya size={18} />
              {l}
            </p>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openBilling({ view: "plans" })}
            className="inline-flex h-11 items-center rounded-[10px] bg-[#00a968] px-5 text-[15px] font-bold text-[#021a10] transition-colors hover:bg-[#20d68a]"
          >
            See plans
          </button>
          <span className="text-sm text-[#c9b98f]">Applied automatically · no code needed</span>
        </div>
      </div>

      <div aria-hidden="true" className="relative hidden w-[400px] flex-none md:block lg:w-[460px]">
        <div className="absolute inset-x-0 bottom-0 flex h-16 items-center">
          <Marquee duration={18}>
            {DIYAS.map((i) => <Diya key={i} size={56} delay={i * 0.23} className="mr-3.5" />)}
          </Marquee>
        </div>
        <Lantern width={44} className="absolute left-[110px] top-0" />
        <Lantern width={44} delay={1.1} className="absolute left-[250px] top-[-30px]" />
        <Lantern width={44} delay={2} className="absolute left-[380px] top-[-10px]" />
        <Sparkle className="absolute left-[60px] top-10" />
        <Sparkle size={10} delay={1} className="absolute left-[330px] top-6" />
        <Sparkle size={12} delay={1.7} color="#20d68a" className="absolute left-[200px] top-[110px]" />
      </div>
    </section>
  );
}
