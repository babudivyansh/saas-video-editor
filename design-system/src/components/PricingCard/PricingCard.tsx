import * as React from "react";
import { cx } from "../../utils/cx";
import { CheckIcon } from "../../icons";
import { Button } from "../Button/Button";

export interface PricingCardProps {
  /** Plan name shown as the small uppercase eyebrow, e.g. "Creator". */
  name: string;
  /** Formatted price, e.g. "₹799". */
  price: string;
  /** Billing period suffix, e.g. "/mo". */
  period?: string;
  /** Short line under the price, e.g. "50 credits / month". */
  subtitle?: string;
  features: string[];
  /** Renders the filled primary card with the floating badge — the app's "Most Popular" treatment. */
  highlighted?: boolean;
  badgeLabel?: string;
  ctaLabel: string;
  onCtaClick?: () => void;
  className?: string;
}

export function PricingCard({
  name,
  price,
  period = "/mo",
  subtitle,
  features,
  highlighted = false,
  badgeLabel = "Most Popular",
  ctaLabel,
  onCtaClick,
  className = "",
}: PricingCardProps) {
  return (
    <div
      className={cx(
        "relative rounded-2xl p-8 border-2 transition-all",
        highlighted
          ? "border-primary bg-primary text-white shadow-2xl md:scale-105"
          : "border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      {highlighted && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-green-400 text-green-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
          {badgeLabel}
        </span>
      )}

      <p className={cx("text-xs font-bold uppercase tracking-widest", highlighted ? "text-white/80" : "text-gray-400")}>
        {name}
      </p>

      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-black">{price}</span>
        <span className={cx("text-sm font-normal", highlighted ? "text-white/70" : "text-gray-400")}>{period}</span>
      </p>

      {subtitle && (
        <p className={cx("mt-1 text-sm", highlighted ? "text-white/80" : "text-gray-500 dark:text-zinc-400")}>{subtitle}</p>
      )}

      <ul className="mt-6 space-y-3">
        {features.map(feature => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <CheckIcon className={cx("h-4 w-4 flex-shrink-0", highlighted ? "text-white" : "text-primary")} />
            <span className={highlighted ? "text-white/90" : "text-gray-700 dark:text-zinc-300"}>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={highlighted ? "secondary" : "primary"}
        className={cx("w-full mt-8", highlighted && "!bg-white !text-primary !border-white hover:!bg-white/90")}
        onClick={onCtaClick}
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
