"use client";

// Shared client pieces for the Black Friday 2026 offer (lib/campaigns/
// black-friday.ts): the live-window hook every surface keys off, the "2×" tag,
// and the copy, worded once. Dark emerald system only — no campaign palette.

import { useEffect, useState } from "react";
import { BLACK_FRIDAY, bfPackBonus, bfPlanBonus, blackFridayPhase, hasRunningPaidPlan, type BlackFridayPhase } from "@/lib/campaigns/black-friday";

/** Campaign phase, re-checked every 30s so a page left open across 00:00 IST
 *  on 26 Nov (or the close on 30 Nov) switches by itself. Dev only:
 *  `?bfPreview=live` shows the sale early. */
export function useBlackFridayPhase(): BlackFridayPhase {
  const [now, setNow] = useState(() => Date.now());
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      setPreview(new URLSearchParams(window.location.search).get("bfPreview") === "live");
    }
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return preview ? "live" : blackFridayPhase(now);
}

export function useBlackFridayLive(): boolean {
  return useBlackFridayPhase() === "live";
}

/** Whether a viewer would get the first-month plan bonus if they subscribed
 *  now. Signed-out visitors and trialists: yes. A running paid plan: no
 *  (an upgrade isn't a new subscription). Mirrors bfPlanBonusAppliesAtCheckout. */
export function bfPlanEligibleFor(user: { subscriptionEndsAt?: string | null; trialEndsAt?: string | null } | null | undefined): boolean {
  if (!user) return true;
  return !hasRunningPaidPlan({
    subscriptionEndsAt: user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null,
    trialEndsAt: user.trialEndsAt ? new Date(user.trialEndsAt) : null,
  });
}

export const BF_COPY = {
  label: "Black Friday",
  packTag: "2× Black Friday",
  planTag: "2× first month",
  ticker: `Black Friday: 2× Clip Minutes on every pack and plan · ends ${BLACK_FRIDAY.endLabel}`,
  packs: `Packs are 2× until ${BLACK_FRIDAY.endLabel}`,
  trial: `Subscribe before ${BLACK_FRIDAY.endLabel} and your first month's minutes are doubled`,
  /** "800 Clip Minutes in month 1, then 400/mo" */
  monthOne: (monthlyMinutes: number) =>
    `${(monthlyMinutes + bfPlanBonus(monthlyMinutes)).toLocaleString("en-IN")} Clip Minutes in month 1, then ${monthlyMinutes.toLocaleString("en-IN")}/mo`,
  packTotal: (packMinutes: number) => packMinutes + bfPackBonus(packMinutes),
} as const;

/** Small "2× …" pill. Lime on near-black, the system's accent. */
export function BfTag({ children = BF_COPY.packTag, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-tint-emerald px-2 py-0.5 font-mono text-[10px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-success ${className}`}
    >
      {children}
    </span>
  );
}
