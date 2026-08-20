"use client";

import Link from "next/link";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";

function IcZap() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden>
      <defs>
        <linearGradient id="zap-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--accent-violet)" />
          <stop offset="100%" stopColor="var(--accent-fuchsia)" />
        </linearGradient>
      </defs>
      <path fill="url(#zap-grad)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

interface CreditsPillProps {
  credits: number;
  /** Overrides the default action, which opens the billing overlay on Usage. */
  href?: string;
  onClick?: () => void;
}

export function CreditsPill({ credits, href, onClick }: CreditsPillProps) {
  const { openBilling } = useBillingOverlay();
  const body = (
    <>
      <IcZap />
      <span className="text-sm font-bold text-ink">{credits}</span>
      <span className="text-xs text-ink-soft font-medium">credits</span>
    </>
  );
  const className =
    "flex items-center gap-1.5 bg-tint-violet hover:bg-violet-100 rounded-full px-3 py-1.5 transition-all hover:scale-[1.03] cursor-pointer";

  return (
    <Tooltip content="Credits are spent each time you generate content. Different tools cost different amounts." position="bottom">
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
