"use client";

// Thin launch ticker at the very top of every public page (mockup 2). Lives
// inside SiteNavbar's sticky header, so it stays pinned with the nav. The
// navbar reads `useSiteTickerVisible()` to push its fixed menus below it.

import Link from "next/link";
import { DIWALI, diwaliOfferId } from "@/lib/campaigns/diwali";
import { Diya, Marquee, Toran, useDiwaliPhase, useDismissed } from "./DiwaliDecor";

/** Height the ticker adds to the header, px. Keep in sync with the markup. */
export const SITE_TICKER_HEIGHT = 40;

const DISMISS_KEY = "clipiro:diwali26:site-ticker";

export function useSiteTicker(): { visible: boolean; dismiss: () => void } {
  const { phase } = useDiwaliPhase();
  const [dismissed, dismiss] = useDismissed(DISMISS_KEY, "session");
  return { visible: phase !== "over" && !dismissed, dismiss };
}

export default function SiteLaunchTicker({ onDismiss }: { onDismiss: () => void }) {
  const { phase, offerLive } = useDiwaliPhase();
  const showOffer = offerLive || (phase === "countdown" && diwaliOfferId() !== null);

  const gold = "font-extrabold uppercase tracking-[0.05em] text-[#ffd23f]";
  const items: { text: string; cls: string }[] = [
    { text: phase === "live" ? "Clipiro is live" : "Launching 8 Nov 2026", cls: gold },
    ...(showOffer
      ? [
          { text: `Diwali offer: extra ${DIWALI.extraPct}% off yearly plans, on top of ${DIWALI.yearlyPct}%`, cls: "" },
          { text: `${DIWALI.code} · applied automatically`, cls: gold },
          { text: `Ends ${DIWALI.endLabel}`, cls: "" },
        ]
      : []),
    { text: "Happy Diwali from Clipiro", cls: "" },
  ];
  const row = [...items, ...items, ...items];

  return (
    <div role="region" aria-label="Launch announcement" className="relative flex h-10 flex-col bg-[#0d0a04] font-sans">
      <Toran small className="h-[6px]" />
      <div className="flex min-h-0 flex-1 items-center">
        <Marquee duration={36} className="min-w-0 flex-1">
          {row.map((t, i) => (
            <div key={i} className="flex items-center gap-3 whitespace-nowrap pr-3 text-[13px] font-semibold text-[#f6e7c1] sm:text-sm">
              <span className={t.cls}>{t.text}</span>
              <Diya size={18} delay={i * 0.17} />
            </div>
          ))}
        </Marquee>
        <span className="sr-only">
          {phase === "live" ? "Clipiro is live." : "Clipiro launches 8 November 2026."}
          {showOffer ? ` Diwali offer: an extra ${DIWALI.extraPct}% off yearly plans until ${DIWALI.endLabel}, applied automatically.` : ""}
        </span>
        {showOffer && (
          <Link
            href="/pricing?billing=yearly#plans"
            className="hidden h-full shrink-0 items-center gap-1.5 bg-gradient-to-r from-transparent to-[#0d0a04] to-30% pl-10 pr-2 text-sm font-bold text-[#ffd23f] no-underline hover:text-[#fff3c4] sm:flex"
          >
            Claim extra {DIWALI.extraPct}% off
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide announcement"
          className="flex h-[34px] w-10 shrink-0 items-center justify-center text-[#c9b98f] hover:text-[#fff3c4]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
