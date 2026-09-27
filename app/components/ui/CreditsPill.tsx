"use client";

import Link from "next/link";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";

interface CreditsPillProps {
  credits: number;
  /**
   * Clip Minutes balance (2026-09-26 pricing model). When given, the pill shows
   * both meters — minutes first, since AutoClip is the product most people come
   * for — and the tooltip explains which one each thing spends.
   */
  minutes?: number;
  /** Clip Minutes are running low (lib/plans/tiers.ts isLowMinutes): tint amber. */
  minutesLow?: boolean;
  /** Overrides the default action, which opens the billing overlay on Usage. */
  href?: string;
  onClick?: () => void;
}

function IcClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

function IcSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
    </svg>
  );
}

export function CreditsPill({ credits, minutes, minutesLow = false, href, onClick }: CreditsPillProps) {
  const { openBilling } = useBillingOverlay();
  const both = minutes != null;
  const body = both ? (
    <>
      <span
        className={`flex items-center gap-1 ${minutesLow ? "text-warning" : "text-ink"}`}
        aria-label={`${minutes} Clip Minutes${minutesLow ? " — running low" : ""}`}
      >
        <span className={minutesLow ? "text-warning" : "text-brand"}><IcClock /></span>
        <span className="text-sm font-bold">{minutes}</span>
        <span className="text-xs text-ink-soft font-medium">min</span>
      </span>
      <span className="h-3.5 w-px bg-card-border" aria-hidden />
      <span className="flex items-center gap-1 text-ink" aria-label={`${credits} AI credits`}>
        <span className="text-brand"><IcSpark /></span>
        <span className="text-sm font-bold">{credits}</span>
        <span className="text-xs text-ink-soft font-medium">credits</span>
      </span>
    </>
  ) : (
    <>
      <span className="text-sm font-bold text-ink">{credits}</span>
      <span className="text-xs text-ink-soft font-medium">credits</span>
    </>
  );
  const className =
    "flex items-center gap-2 bg-tint-violet hover:bg-tint-fuchsia rounded-full px-3 py-1.5 transition-all hover:scale-[1.03] cursor-pointer";
  const tip = both
    ? "Clip Minutes pay for Auto Clips — 1 minute per minute of video. AI credits pay for the AI tools, dubbing and premium captions."
    : "Credits are spent each time you generate content. Different tools cost different amounts.";

  return (
    <Tooltip content={tip} position="bottom">
      {href ? (
        <Link href={href} className={className}>{body}</Link>
      ) : (
        // Billing is an overlay now, so the default is an action rather than
        // the old /billing?tab=usage link.
        <button onClick={onClick ?? (() => openBilling({ tab: "usage" }))} className={className}>
          {body}
        </button>
      )}
    </Tooltip>
  );
}
