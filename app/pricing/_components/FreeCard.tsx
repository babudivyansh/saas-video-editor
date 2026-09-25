"use client";

// The free tier is real (free tools, a monthly bonus grant, watermarked Auto
// Clip runs) but used to appear only in an FAQ answer near the foot of the
// page. Every figure is read from lib/plans/tiers.ts so it can't drift. Same
// section order as PlanCard so the four cards' rows line up.

import Link from "next/link";
import type { Currency } from "@/lib/currency-shared";
import {
  FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, STORAGE_LIMIT_GB,
} from "@/lib/plans/tiers";
import { TIER_TAGLINE } from "@/lib/plans/display";
import { CheckIcon } from "@/app/components/billing/PlanCard";

export function FreeCard({ currency }: { currency: Currency }) {
  const perks = [
    "All free tools: compressor, MP3, downloaders",
    `${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} Auto Clip runs / month (watermarked)`,
    `${STORAGE_LIMIT_GB.free * 1000} MB storage`,
  ];
  return (
    <div className="row-span-4 grid grid-rows-subgrid gap-y-5 rounded-[var(--radius-card)] border border-line bg-surface-1 p-7">
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold text-fg">Free</p>
        <p className="text-[13px] text-fg-muted">{TIER_TAGLINE.free}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-semibold leading-none tracking-tight text-fg">
            <span className="text-[0.6em] align-top">{currency === "USD" ? "$" : "₹"}</span>0
          </span>
          <span className="text-sm text-fg-muted">/mo</span>
        </div>
        <p className="text-[13px] text-fg-subtle">Free forever</p>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/register"
          className="flex min-h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold text-fg ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Start free
        </Link>
        <p className="text-center text-xs text-fg-subtle">No card required</p>
      </div>

      <div className="flex flex-1 flex-col gap-3 border-t border-line pt-5">
        <p className="text-sm font-semibold text-fg">{FREE_TIER_MONTHLY_BONUS_CREDITS} credits every month</p>
        <ul className="space-y-3">
          {perks.map(p => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-fg-muted">
              <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-fg-subtle" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
