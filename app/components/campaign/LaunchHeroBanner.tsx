"use client";

// Landing page launch banner (mockups 1 + 7: desktop and phone are the same
// component). Before 8 Nov it counts down to launch; from launch to the end of
// the offer it says "We're live". Gone after 15 Nov. Mounted in app/page.tsx,
// above the hero.

import Link from "next/link";
import ClipiroLogo from "@/app/components/ClipiroLogo";
import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Lantern, Marquee, OFFER_COPY, Rangoli, Sparkle, Toran, diwaliStyles as s, useDiwaliOffers, useLaunchCountdown } from "./DiwaliDecor";

const SPARKS: [number, number][] = [[57, 20], [63, 10], [70, 87], [82, 78], [92, 15], [49, 78], [88, 43], [67, 42], [97, 67], [44, 10]];

export default function LaunchHeroBanner() {
  const { phase, monthly, yearly } = useDiwaliOffers();
  const units = useLaunchCountdown();
  if (phase === "over") return null;
  const showOffer = monthly || yearly;
  const lines = [...(monthly ? [OFFER_COPY.monthly] : []), ...(yearly ? [OFFER_COPY.yearly] : [])];

  const ticker = [
    phase === "live" ? "Clipiro is live" : "Launching 8 Nov 2026",
    ...(monthly ? [OFFER_COPY.monthlyShort] : []),
    ...(yearly ? [OFFER_COPY.yearlyShort] : []),
    ...(showOffer ? [`Ends ${DIWALI.endLabelShort}`] : []),
    "Happy Diwali",
  ];

  return (
    <section aria-label="Clipiro launch and Diwali offer" className="relative overflow-hidden bg-[#050908] font-sans text-[#eef5f1]">
      <Toran className="absolute inset-x-0 top-0 h-[22px]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-[20px] h-[2px] bg-[#2a5a3c]" />

      {/* Decor — right side on desktop, faint behind the copy on phones. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Rangoli size={440} className="absolute -right-40 top-24 opacity-20 md:right-[8%] md:top-[70px] md:opacity-100" />
        <div className="absolute right-[19%] top-[238px] hidden md:block"><Diya size={120} /></div>
        <Lantern className="absolute right-4 top-0 md:right-[5%]" width={44} />
        <Lantern className="absolute right-[42%] top-0 hidden md:block" delay={1.2} />
        <Lantern className="absolute right-[61%] top-0 hidden opacity-55 lg:block" delay={2.1} />
        {SPARKS.map(([x, y], i) => (
          <Sparkle key={i} delay={i * 0.37} className="absolute hidden md:block" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-screen-2xl flex-col gap-5 px-5 pb-[92px] pt-12 md:px-12 md:pb-[104px] md:pt-14 lg:px-24">
        <div className="flex flex-wrap items-center gap-3 md:gap-5">
          <ClipiroLogo className="h-7 md:h-10" />
          <span aria-hidden="true" className="hidden h-7 w-px bg-[#2a3a33] md:block" />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#3d3416] bg-[#14110a] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-[#f5b544] md:text-sm">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0 L8.4 5.6 L14 7 L8.4 8.4 L7 14 L5.6 8.4 L0 7 L5.6 5.6 Z" fill="#f5b544" /></svg>
            {phase === "live" ? "Live this Diwali" : "Launching this Diwali"}
          </span>
        </div>

        <h2 className="m-0 max-w-[660px] text-[42px] font-extrabold leading-[1.04] tracking-[-0.035em] md:text-[64px]">
          {phase === "live" ? "Clipiro is live" : "Clipiro goes live"}
          <br />
          <span className={`${s.serif} text-[#ffd23f]`}>8 November</span> 2026
        </h2>

        <p className="m-0 max-w-[560px] text-base leading-relaxed text-[#a9bdb3] md:text-[19px]">
          Long videos in, ready-to-post clips out.
        </p>

        {showOffer && (
          <div className="flex max-w-[600px] flex-col gap-2 rounded-2xl border border-[#3d3416] bg-[#0d0a04] px-4 py-3.5 md:px-5">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-[#f5b544] md:text-sm">
              Diwali Launch Offer · {phase === "live" ? `until ${DIWALI.endLabel}` : `8–15 Nov`}
            </p>
            {lines.map((l) => (
              <p key={l} className="m-0 flex items-start gap-2.5 text-[15px] font-semibold text-[#eef5f1] md:text-[17px]">
                <Diya size={20} className="mt-0.5" />
                {l}
              </p>
            ))}
            <p className="m-0 text-xs text-[#c9b98f] md:text-sm">Applied automatically · no code needed</p>
          </div>
        )}

        {phase === "countdown" ? (
          <div role="timer" aria-label="Time until launch" className="flex gap-2.5 md:gap-3">
            {(units ?? [{ k: "Days", v: "--" }, { k: "Hours", v: "--" }, { k: "Mins", v: "--" }, { k: "Secs", v: "--" }]).map((u) => (
              <div key={u.k} className="flex w-[72px] flex-col items-center gap-0.5 rounded-[14px] border border-[#1d2b25] bg-[#0b1210] py-2.5 md:w-[84px] md:py-3">
                <span className="text-[26px] font-bold tabular-nums md:text-[32px]">{u.v}</span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-[#8aa597] md:text-xs">{u.k}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2.5 self-start rounded-xl border border-[#1f6b47] bg-[#0d2a1d] px-4 py-2.5 text-base font-semibold text-[#20d68a] md:text-[17px]">
            <span className="h-2 w-2 rounded-full bg-[#20d68a]" />
            We&apos;re live — Happy Diwali!
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={yearly ? "/pricing?billing=yearly#plans" : "/pricing#plans"}
            className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-[#00a968] px-6 text-base font-bold text-[#021a10] no-underline transition-colors hover:bg-[#20d68a] md:text-[17px]"
          >
            {showOffer ? "Claim the Diwali offer" : "See plans"}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-[52px] items-center justify-center rounded-xl border border-[#2a3a33] px-5 text-base font-semibold text-[#eef5f1] no-underline transition-colors hover:border-[#3d5a4c] md:text-[17px]"
          >
            See pricing
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-12 items-center bg-[#ffd23f] md:h-14">
        <Marquee duration={30}>
          {[...ticker, ...ticker].map((t, i) => (
            <div key={i} className="flex items-center gap-4 whitespace-nowrap pr-4 text-sm font-extrabold uppercase tracking-[0.06em] text-[#1a0f02] md:text-lg">
              <span>{t}</span>
              <Diya size={26} dark delay={i * 0.2} />
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
