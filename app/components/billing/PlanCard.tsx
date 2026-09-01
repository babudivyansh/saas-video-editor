"use client";

// One plan card, rendered identically by /pricing and by the billing
// PlansModal. Previously each surface had its own copy of this markup, so the
// modal a signed-in customer actually buys through kept the pre-audit design:
// a "Most Popular" badge that wrapped onto two lines, bullets that repeated
// the credits line directly above them, and claims already corrected on the
// marketing page.

import { formatMoney, type Currency } from "@/lib/currency-shared";
import { TIER_LABEL } from "@/lib/plans/tiers";
import {
  minorUnits, tierHighlights, tierSavePct, cheapestVideoCostPerRender, cheapestImageCost,
  type DisplayPlan,
} from "@/lib/plans/display";

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  /** Optional secondary action under the CTA (the 7-day trial on Pro). */
  footer?: React.ReactNode;
}

export function PlanCard({
  plan, subs, currency, highlighted, isCurrent, onSelect, size = "default", ctaLabel, footer,
}: PlanCardProps) {
  const total = minorUnits(plan, currency);
  const months = plan.intervalMonths ?? 1;
  const perMonth = Math.round(total / months);
  const baseTier = plan.tier ? TIER_LABEL[plan.tier] : plan.name.replace(/\s*\(.*\)$/, "");
  const savePct = tierSavePct(plan, subs, currency);
  const compact = size === "compact";

  return (
    <div
      className={`relative h-full rounded-2xl border-2 flex flex-col ${compact ? "p-6" : "p-8"} ${
        highlighted
          ? "border-brand bg-brand text-white shadow-xl"
          : "border-gray-100 bg-white text-gray-900 shadow-sm"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          {/* whitespace-nowrap is load-bearing: at card widths this narrow the
              pill wrapped onto two lines and hung off the top of the card. */}
          <span className="block whitespace-nowrap bg-green-400 text-green-900 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wide">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className={`text-sm font-bold uppercase tracking-widest ${highlighted ? "text-white" : "text-gray-500"}`}>
            {baseTier}
          </p>
          {isCurrent && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
              highlighted ? "bg-white/20 text-white" : "bg-tint-emerald text-green-700"
            }`}>
              Current
            </span>
          )}
        </div>

        {/* The price, and nothing competing with it. The symbol is its own
            element so it reads as a symbol rather than another digit. */}
        <div className="flex items-start gap-0.5">
          <span className={`text-xl font-bold mt-1.5 ${highlighted ? "text-white" : "text-gray-500"}`}>
            {currency === "USD" ? "$" : "₹"}
          </span>
          <span className={`${compact ? "text-4xl" : "text-5xl"} font-black leading-none tracking-tight`}>
            {formatMoney(perMonth, currency).replace(/^[₹$]/, "")}
          </span>
          <span className={`text-sm font-medium self-end mb-1 ml-1 ${highlighted ? "text-white" : "text-gray-500"}`}>
            /month
          </span>
        </div>

        {/* One secondary line, only when yearly changes the story. */}
        {months > 1 && (
          <p className={`text-xs mt-2 ${highlighted ? "text-white" : "text-gray-500"}`}>
            Billed {formatMoney(total, currency)} yearly
            {savePct && (
              <span className={`font-bold ${highlighted ? "text-green-300" : "text-green-600"}`}>
                {" "}· save {savePct}%
              </span>
            )}
          </p>
        )}

        <p className={`text-sm font-semibold mt-4 pt-4 border-t ${
          highlighted ? "text-white border-white/20" : "text-gray-900 border-gray-100"
        }`}>
          {plan.monthlyCredits} credits every month
        </p>
        {/* Credits→output estimate sits under the figure it qualifies rather
            than spending one of the five bullets. The "cheapest model" caveat
            is a tooltip — spelled out inline it wrapped onto three lines. */}
        {plan.monthlyCredits != null && plan.tier && (() => {
          const perRender = cheapestVideoCostPerRender(plan.tier);
          const images = Math.floor(plan.monthlyCredits / cheapestImageCost);
          return (
            <p className={`text-xs mt-1 ${highlighted ? "text-white" : "text-gray-500"}`}>
              ≈ {images} images or {perRender ? Math.floor(plan.monthlyCredits / perRender) : 0} videos
              <span className={highlighted ? "text-white/90" : "text-gray-500"}> on the cheapest model</span>
            </p>
          );
        })()}
      </div>

      {plan.tier && (() => {
        const { inherits, bullets } = tierHighlights(plan.tier);
        return (
          <>
            {inherits && (
              <p className={`text-xs font-bold mb-3 ${highlighted ? "text-white" : "text-gray-500"}`}>
                Everything in {inherits}, plus:
              </p>
            )}
            <ul className="space-y-3 mb-8 flex-1">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? "text-white" : "text-brand"}`} />
                  <span className={highlighted ? "text-white" : "text-gray-700"}>{b}</span>
                </li>
              ))}
            </ul>
          </>
        );
      })()}

      <button
        onClick={() => onSelect(plan)}
        className={`w-full mt-auto font-bold py-3 rounded-full transition-all ${
          highlighted
            ? "bg-white text-brand hover:bg-tint-blue shadow-lg"
            : "bg-brand text-white hover:bg-brand-dark ring-1 ring-brand-soft"
        }`}
      >
        {ctaLabel ?? (isCurrent ? `Renew ${baseTier}` : `Get ${baseTier}`)}
      </button>

      {footer}
    </div>
  );
}
