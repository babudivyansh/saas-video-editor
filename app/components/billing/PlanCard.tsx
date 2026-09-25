"use client";

// One plan card, rendered identically by /pricing and by the billing
// PlansModal. Previously each surface had its own copy of this markup, so the
// modal a signed-in customer actually buys through kept the pre-audit design:
// a "Most Popular" badge that wrapped onto two lines, bullets that repeated
// the credits line directly above them, and claims already corrected on the
// marketing page.
//
// Layout (2026-09 redesign): name + tagline, price, billing line, CTA, then
// the credits line and bullets. The CTA sits above the bullets so every card's
// button lands on the same row, and the recommended card is a raised surface
// with a lime outline rather than a solid lime slab competing with the price.

import { formatMoney, type Currency } from "@/lib/currency-shared";
import { TIER_LABEL } from "@/lib/plans/tiers";
import {
  minorUnits, tierHighlights, tierSavePct, cheapestVideoCostPerRender, cheapestImageCost,
  monthlyCounterpart, TIER_TAGLINE,
  type DisplayPlan,
} from "@/lib/plans/display";

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "₹1,499" → ["₹", "1,499"], so the symbol can be set smaller than the digits. */
function splitMoney(minor: number, currency: Currency) {
  const s = formatMoney(minor, currency);
  const m = s.match(/^([^\d]+)(.*)$/);
  return m ? { symbol: m[1], digits: m[2] } : { symbol: "", digits: s };
}

interface PlanCardProps {
  plan: DisplayPlan;
  /** All subscription plans, needed to derive this tier's own yearly saving. */
  subs: DisplayPlan[];
  currency: Currency;
  highlighted: boolean;
  /** Marks the plan the viewer is already subscribed to. */
  isCurrent?: boolean;
  onSelect: (plan: DisplayPlan) => void;
  /** "compact" trims padding for the modal, where vertical space is tighter. */
  size?: "default" | "compact";
  ctaLabel?: string;
  /** Extra classes for the card root (e.g. grid order on /pricing). */
  className?: string;
  /** One short line under the CTA (the trial terms on Pro, "Cancel anytime"). */
  footer?: React.ReactNode;
}

export function PlanCard({
  plan, subs, currency, highlighted, isCurrent, onSelect, size = "default", ctaLabel, footer, className = "",
}: PlanCardProps) {
  const total = minorUnits(plan, currency);
  const months = plan.intervalMonths ?? 1;
  const perMonth = Math.round(total / months);
  const baseTier = plan.tier ? TIER_LABEL[plan.tier] : plan.name.replace(/\s*\(.*\)$/, "");
  const savePct = tierSavePct(plan, subs, currency);
  const monthly = monthlyCounterpart(plan, subs);
  const wasPerMonth = monthly ? minorUnits(monthly, currency) : null;
  const compact = size === "compact";
  const price = splitMoney(perMonth, currency);

  return (
    <div
      className={`relative row-span-4 grid grid-rows-subgrid gap-y-5 rounded-[var(--radius-card)] border ${compact ? "p-6" : "p-7"} ${className} ${
        highlighted
          ? "border-primary bg-gradient-to-b from-[color-mix(in_oklab,var(--primary)_9%,var(--surface-2))] to-surface-2 to-60% shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_8%,transparent),0_24px_64px_-24px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
          : "border-line bg-surface-2"
      }`}
    >
      {highlighted && (
        // whitespace-nowrap is load-bearing: at card widths this narrow the
        // pill wrapped onto two lines and hung off the top of the card.
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-on-primary">
          Most popular
        </span>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-semibold text-fg">{baseTier}</p>
          {isCurrent && (
            <span className="rounded-full bg-tint-emerald px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
              Current
            </span>
          )}
        </div>
        {plan.tier && <p className="text-[13px] text-fg-muted">{TIER_TAGLINE[plan.tier]}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        {/* flex-wrap: a struck price plus a long yearly figure ("$39.50") ran
            past a quarter-width card's edge at 1440px. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {wasPerMonth != null && wasPerMonth > perMonth && (
            <s className="text-xl font-medium text-fg-subtle decoration-fg-muted" aria-label={`Was ${formatMoney(wasPerMonth, currency)} per month`}>
              {formatMoney(wasPerMonth, currency)}
            </s>
          )}
          <span className={`${compact || price.digits.includes(".") ? "text-4xl" : "text-5xl"} font-semibold leading-none tracking-tight text-fg`}>
            <span className="text-[0.6em] align-top">{price.symbol}</span>
            {price.digits}
          </span>
          <span className="text-sm text-fg-muted">/mo</span>
        </div>
        <p className="text-[13px] text-fg-subtle">
          {months > 1 ? (
            <>
              {formatMoney(total, currency)} billed yearly
              {savePct && <span className="font-semibold text-success"> · save {savePct}%</span>}
            </>
          ) : (
            "Billed monthly"
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onSelect(plan)}
          className={`min-h-12 w-full rounded-full text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
            highlighted
              ? "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-press"
              : "bg-surface-3 text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-raised hover:ring-fg-subtle"
          }`}
        >
          {ctaLabel ?? (isCurrent ? `Renew ${baseTier}` : `Get ${baseTier}`)}
        </button>
        {footer}
      </div>

      <div className={`flex flex-1 flex-col gap-3 border-t pt-5 ${
        highlighted ? "border-[color-mix(in_oklab,var(--primary)_18%,transparent)]" : "border-line"
      }`}>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{plan.monthlyCredits} credits every month</p>
          {/* Credits→output estimate sits under the figure it qualifies. */}
          {plan.monthlyCredits != null && plan.tier && (() => {
            const perRender = cheapestVideoCostPerRender(plan.tier);
            const images = Math.floor(plan.monthlyCredits / cheapestImageCost);
            return (
              <p className="text-xs text-fg-subtle" title="On the cheapest model">
                ≈ {images} images or {perRender ? Math.floor(plan.monthlyCredits / perRender) : 0} videos
              </p>
            );
          })()}
        </div>

        {plan.tier && (() => {
          const { inherits, bullets } = tierHighlights(plan.tier);
          return (
            <>
              {inherits && <p className="text-xs font-semibold text-fg-muted">Everything in {inherits}, plus:</p>}
              <ul className="space-y-3">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-fg-muted">
                    <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </div>
    </div>
  );
}
