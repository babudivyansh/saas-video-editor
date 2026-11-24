"use client";

// Dismissible offer strip across the top of the dashboard (mockup 3). Shown
// during launch week; the yearly line only once its Razorpay offer is set.
// Mounted in DashboardShell above the header.

import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { DIWALI } from "@/lib/campaigns/diwali";
import { Diya, Marquee, OFFER_COPY, Sparkle, useDiwaliOffers, useDismissed } from "./DiwaliDecor";
import { BF_COPY, useBlackFridayLive } from "./BlackFriday";
import { BLACK_FRIDAY } from "@/lib/campaigns/black-friday";

/** Black Friday 2026 (24 Nov 4 PM - 30 Nov IST): same strip, dark emerald system. */
function BlackFridayStrip() {
  const [dismissed, dismiss] = useDismissed("clipiro:bf26:dash-strip");
  const { openBilling } = useBillingOverlay();
  if (dismissed) return null;
  const items = [
    { text: "2× Clip Minutes on every pack and plan", cls: "font-bold text-success" },
    { text: "Packs: double the minutes, same price", cls: "" },
    { text: "New plans: first month of minutes doubled", cls: "" },
    { text: "Applied automatically · no code needed", cls: "" },
    { text: `Ends ${BLACK_FRIDAY.endLabel}`, cls: "font-bold text-fg" },
  ];
  const row = [...items, ...items, ...items];
  return (
    <div role="region" aria-label="Black Friday offer" className="relative flex h-12 shrink-0 items-center overflow-hidden border-b border-line bg-surface-1 font-sans">
      <div className="relative z-[1] flex h-full items-center bg-primary pl-4 pr-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-on-primary whitespace-nowrap sm:pl-5">
        <span className="hidden sm:inline">2× {BF_COPY.label}</span>
        <span className="sm:hidden">2× BF</span>
      </div>
      <Marquee duration={40} className="min-w-0 flex-1">
        {row.map((t, i) => (
          <div key={i} className="flex items-center gap-3.5 whitespace-nowrap pl-3.5 text-sm text-fg-muted">
            <span className={t.cls}>{t.text}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" />
          </div>
        ))}
      </Marquee>
      <span className="sr-only">{BF_COPY.ticker}. Applied automatically.</span>
      <button
        type="button"
        onClick={() => openBilling({ view: "plans" })}
        className="relative z-[1] ml-3 flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg bg-primary px-3.5 text-[13px] font-bold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <span className="hidden sm:inline">See the offer</span>
        <span className="sm:hidden">Offer</span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss offer"
        className="relative z-[1] mx-0.5 flex h-11 w-11 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

export default function DashboardOfferStrip() {
  const bfLive = useBlackFridayLive();
  return bfLive ? <BlackFridayStrip /> : <DiwaliStrip />;
}

function DiwaliStrip() {
  const { phase, monthly, yearly } = useDiwaliOffers();
  const [dismissed, dismiss] = useDismissed("clipiro:diwali26:dash-strip");
  const { openBilling } = useBillingOverlay();
  if (phase !== "live" || dismissed) return null;

  const items = [
    { text: "Clipiro is officially live: 8 Nov 2026", cls: "font-bold text-[#20d68a]" },
    ...(monthly ? [{ text: OFFER_COPY.monthly, cls: "" }] : []),
    ...(yearly ? [{ text: OFFER_COPY.yearly, cls: "" }] : []),
    { text: "Applied automatically · no code needed", cls: "font-bold text-[#ffd23f]" },
    { text: `Offer ends ${DIWALI.endLabel}`, cls: "" },
  ];
  const row = [...items, ...items, ...items];

  return (
    <div role="region" aria-label="Diwali offer" className="relative flex h-12 shrink-0 items-center overflow-hidden border-b border-[#3d3416] bg-[#0b1210] font-sans">
      <div className="relative z-[1] flex h-full items-center gap-2 bg-[#ffd23f] pl-4 pr-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[#1a0f02] whitespace-nowrap sm:pl-5 sm:text-[13px]">
        <Diya size={18} dark />
        <span className="hidden sm:inline">Diwali × Launch</span>
        <span className="sm:hidden">Diwali</span>
      </div>
      <div aria-hidden="true" className="relative z-[1] h-0 w-0 border-y-[24px] border-l-[14px] border-y-transparent border-l-[#ffd23f]" />
      <Marquee duration={40} className="min-w-0 flex-1">
        {row.map((t, i) => (
          <div key={i} className="flex items-center gap-3.5 whitespace-nowrap pr-3.5 text-sm text-[#d6e4dc]">
            <span className={t.cls}>{t.text}</span>
            <Sparkle size={10} color="#f5b544" delay={i * 0.3} />
          </div>
        ))}
      </Marquee>
      <span className="sr-only">
        Clipiro is live. Diwali Launch Offer, applied automatically until {DIWALI.endLabel}.
        {monthly ? ` ${OFFER_COPY.monthly}.` : ""}{yearly ? ` ${OFFER_COPY.yearly}.` : ""}
      </span>
      <button
        type="button"
        onClick={() => openBilling({ view: "plans" })}
        className="relative z-[1] ml-3 flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg bg-[#00a968] px-3.5 text-[13px] font-bold text-[#021a10] transition-colors hover:bg-[#20d68a]"
      >
        <span className="hidden sm:inline">See the Diwali offer</span>
        <span className="sm:hidden">Offer</span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss offer"
        className="relative z-[1] mx-0.5 flex h-11 w-11 shrink-0 items-center justify-center text-[#8aa597] hover:text-fg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
