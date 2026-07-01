import * as React from "react";
import { cx } from "../../utils/cx";

export interface CreditBadgeProps {
  /** Credit cost, or "free" for the app's free-tool pill. */
  cost: number | "free";
  /** Veo3-restricted credits render in the purple accent tone rather than primary blue. */
  veo3?: boolean;
  className?: string;
}

export function CreditBadge({ cost, veo3 = false, className = "" }: CreditBadgeProps) {
  const isFree = cost === "free";
  const label = isFree ? "Free" : `${cost} credit${cost === 1 ? "" : "s"}`;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        isFree ? "bg-green-100 text-green-700" : veo3 ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700",
        className,
      )}
    >
      {label}
    </span>
  );
}
