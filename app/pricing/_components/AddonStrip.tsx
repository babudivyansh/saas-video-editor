"use client";

// Credit packs as one compact strip, each with its own Buy button.
//
// Packs used to be toggles that "bundle into the next plan checkout" for
// anyone without an active plan. A subscription is billed at its synced
// Razorpay plan amount, so a bundled pack was never charged or granted — the
// toggle is gone (2026-09-25). Packs are open to everyone, plan or not.

import { formatMoney, type Currency } from "@/lib/currency-shared";
import { minorUnits } from "@/lib/plans/display";
import type { DbPlan } from "./types";

// Also sells Clip Minute packs (2026-09-26): same strip, `unit="minutes"`.
const COPY = {
  credits: {
    title: "Need more credits?",
    blurb: "Top up any time, with or without a plan. Pack credits stack with your plan and never expire.",
    amount: (p: DbPlan) => `${p.credits} credits`,
  },
  minutes: {
    title: "Need more Clip Minutes?",
    blurb: "For Auto Clips — 1 minute per minute of video. Pack minutes stack with your plan and never expire.",
    amount: (p: DbPlan) => `${p.minutes ?? 0} min`,
  },
} as const;

export function AddonStrip({ packs, currency, buyingPack, onBuy, unit = "credits" }: {
  packs: DbPlan[];
  currency: Currency;
  buyingPack: string | null;
  onBuy: (pack: DbPlan) => void;
  unit?: "credits" | "minutes";
}) {
  if (packs.length === 0) return null;
  const copy = COPY[unit];
  const qty = (p: DbPlan) => Math.max(1, unit === "minutes" ? p.minutes ?? 0 : p.credits);
  // The largest pack carries the best per-unit price; mark it rather than
  // asserting it, in case admin pricing ever changes the order.
  const best = packs.reduce((a, b) =>
    minorUnits(b, currency) / qty(b) < minorUnits(a, currency) / qty(a) ? b : a);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-line bg-surface-1 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex flex-col gap-2 lg:w-72 lg:flex-shrink-0">
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-fg sm:text-2xl">{copy.title}</h2>
          <p className="text-sm leading-relaxed text-fg-muted">{copy.blurb}</p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {packs.map(pack => {
            const price = formatMoney(minorUnits(pack, currency), currency);
            const loading = buyingPack === pack.slug;
            return (
              <div key={pack.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-2 p-4">
                <span className="text-[13px] text-fg-muted">
                  {unit === "minutes" ? "Minute pack" : pack.name.replace(/\s*Pack$/i, "")}
                  {pack.id === best.id && packs.length > 1 && <span className="font-semibold text-success"> · best value</span>}
                </span>
                <span className="text-xl font-semibold text-fg sm:text-[22px]">{copy.amount(pack)}</span>
                <span className="text-sm text-fg-muted">{price}</span>
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
          })}
        </div>
      </div>
    </section>
  );
}
