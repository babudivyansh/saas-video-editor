"use client";

// Add-on credit packs as one compact strip. Without an active plan a pack is
// a toggle that bundles into the next plan checkout; with one, each pack gets
// its own Buy button for an instant top-up.

import { formatMoney, type Currency } from "@/lib/currency-shared";
import { minorUnits } from "@/lib/plans/display";
import type { DbPlan } from "./types";

export function AddonStrip({ packs, currency, selected, onToggle, hasActivePlan, buyingPack, onBuy }: {
  packs: DbPlan[];
  currency: Currency;
  selected: string[];
  onToggle: (slug: string) => void;
  hasActivePlan: boolean;
  buyingPack: string | null;
  onBuy: (pack: DbPlan) => void;
}) {
  if (packs.length === 0) return null;
  // The largest pack carries the best per-credit price; mark it rather than
  // asserting it, in case admin pricing ever changes the order.
  const best = packs.reduce((a, b) =>
    minorUnits(b, currency) / b.credits < minorUnits(a, currency) / a.credits ? b : a);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-line bg-surface-1 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex flex-col gap-2 lg:w-72 lg:flex-shrink-0">
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-fg sm:text-2xl">Need more credits?</h2>
          <p className="text-sm leading-relaxed text-fg-muted">
            {hasActivePlan
              ? "Top up anytime. Pack credits stack with your plan and never expire."
              : selected.length > 0
                ? `${selected.length} pack${selected.length > 1 ? "s" : ""} selected. Pick a plan above to buy them together.`
                : "Select a pack to bundle it with your plan at checkout. Pack credits never expire."}
          </p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {packs.map(pack => {
            const checked = selected.includes(pack.slug);
            const price = formatMoney(minorUnits(pack, currency), currency);
            const body = (
              <>
                <span className="text-[13px] text-fg-muted">
                  {pack.name.replace(/\s*Pack$/i, "")}
                  {pack.id === best.id && packs.length > 1 && <span className="font-semibold text-success"> · best value</span>}
                </span>
                <span className="text-xl font-semibold text-fg sm:text-[22px]">{pack.credits} credits</span>
                <span className="text-sm text-fg-muted">{price}</span>
              </>
            );

            if (hasActivePlan) {
              const loading = buyingPack === pack.slug;
              return (
                <div key={pack.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-2 p-4">
                  {body}
                  <button
                    type="button"
                    onClick={() => onBuy(pack)}
                    disabled={!!buyingPack}
                    className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-surface-3 text-sm font-semibold text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-raised disabled:opacity-60"
                  >
                    {loading ? (
                      <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg/30 border-t-fg" />Buying…</>
                    ) : `Buy for ${price}`}
                  </button>
                </div>
              );
            }

            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={checked}
                onClick={() => onToggle(pack.slug)}
                className={`relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  checked ? "border-primary bg-surface-3" : "border-line bg-surface-2 hover:border-line-strong"
                }`}
              >
                {checked && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
                {body}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
