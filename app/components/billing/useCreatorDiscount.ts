"use client";

import { useEffect, useState } from "react";

export interface CreatorDiscountView {
  pct: number;
  handle: string | null;
}

/**
 * The signed-in user's creator partner discount (lib/creator-program.ts), or
 * null. Checkout summaries use it to show the discount line. The server still
 * decides what is charged; this only mirrors it. Pass `enabled: false` while
 * signed out to skip the request.
 */
export function useCreatorDiscount(enabled: boolean): CreatorDiscountView | null {
  const [discount, setDiscount] = useState<CreatorDiscountView | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/creator-program/discount")
      .then((r) => (r.ok ? r.json() : { discount: null }))
      .then((d: { discount: CreatorDiscountView | null }) => { if (live) setDiscount(d.discount ?? null); })
      .catch(() => { if (live) setDiscount(null); });
    return () => { live = false; };
  }, [enabled]);
  // Signed out: never show a discount, even one fetched for an earlier session.
  return enabled ? discount : null;
}

/** Whether a checkout of this shape gets the creator discount — mirrors the
 *  server (app/api/billing/checkout): INR, not a free trial, no other offer. */
export function creatorDiscountApplies(args: { currency: string; trial: boolean; otherOffer: boolean }): boolean {
  return args.currency === "INR" && !args.trial && !args.otherOffer;
}
