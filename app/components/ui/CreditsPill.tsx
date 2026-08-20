"use client";

import Link from "next/link";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";

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
