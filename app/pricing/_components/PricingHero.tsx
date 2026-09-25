"use client";

import type { Currency } from "@/lib/currency-shared";
import { FREE_TIER_MONTHLY_BONUS_CREDITS } from "@/lib/plans/tiers";

interface SegmentOption<T> { value: T; label: React.ReactNode }

/** Pill-shaped two-way toggle; the active segment is the lime primary. */
function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-1">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-5 ${
              active ? "bg-primary font-semibold text-on-primary" : "font-medium text-fg-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PricingHero({ term, onTerm, currency, onCurrency, savePct }: {
  term: number;
  onTerm: (months: number) => void;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  savePct: number | null;
}) {
  return (
    <section className="relative px-4 pt-14 text-center sm:pt-20">
      {/* Soft lime glow behind the headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-380px] h-[700px] w-[800px] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
      />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-5">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Pricing</p>
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl">
          Turn long videos into clips.<br className="hidden sm:block" /> Pay only for what you make.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
          One credit balance for every AI tool. Start free with {FREE_TIER_MONTHLY_BONUS_CREDITS} credits a
          month, then upgrade when you need more.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Segmented
            label="Billing period"
            value={term}
            onChange={onTerm}
            options={[
              { value: 1, label: "Monthly" },
              {
                value: 12,
                label: (
                  <>
                    Yearly
                    {savePct != null && (
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        term === 12 ? "bg-on-primary text-primary" : "bg-tint-emerald text-success"
                      }`}>
                        −{savePct}%
                      </span>
                    )}
                  </>
                ),
              },
            ]}
          />
          <Segmented
            label="Currency"
            value={currency}
            onChange={onCurrency}
            options={[
              { value: "INR" as Currency, label: "₹ INR" },
              { value: "USD" as Currency, label: "$ USD" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

export function TrustRow() {
  const items: { label: string; icon: React.ReactNode }[] = [
    { label: "3-day money-back guarantee", icon: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /> },
    { label: "Cancel anytime", icon: <><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></> },
    { label: "UPI, cards & wallets via Razorpay", icon: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></> },
    { label: "Commercial license on every plan", icon: <path d="M4 12h16M12 4v16" /> },
  ];
  return (
    <ul className="mx-auto mt-7 flex max-w-5xl flex-wrap justify-center gap-x-9 gap-y-3 px-4 text-[13px] text-fg-muted">
      {items.map(i => (
        <li key={i.label} className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success" aria-hidden="true">
            {i.icon}
          </svg>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
