// Diwali 2026 launch campaign — one source of truth for the dates, the copy
// numbers and whether the extra yearly discount is really applied.
//
// Clipiro launches on Diwali, 8 Nov 2026. From launch until the end of 15 Nov
// (IST) every NEW yearly subscription gets an extra 10% off its first payment,
// on top of the usual ~25% yearly saving that is already in the plan price.
//
// How the 10% is charged: plans are Razorpay Subscriptions, which take no
// coupons (lib/coupons.ts — a coupon there was shown and never charged). The
// discount is a Razorpay *Offer* created in the Razorpay dashboard and attached
// to the subscription with `offer_id` at creation (api/billing/checkout). The
// customer types nothing; "DIWALI26" is only the campaign's display name.
//
// Until NEXT_PUBLIC_RAZORPAY_DIWALI_OFFER_ID is set (and the app rebuilt — it is
// inlined at build time) nothing claims or applies the discount: banners fall
// back to launch-only copy and checkout charges the normal price. So a missing
// offer can never produce a banner that promises money off that isn't taken.

export const DIWALI = {
  /** Launch moment: 8 Nov 2026, 00:00 IST. */
  launchAt: Date.parse("2026-11-08T00:00:00+05:30"),
  /** Offer closes at the end of 15 Nov 2026 IST. */
  offerEndsAt: Date.parse("2026-11-15T23:59:59+05:30"),
  /** The extra discount on a yearly plan's first payment, percent. */
  extraPct: 10,
  /** The standing yearly saving the copy refers to ("on top of the usual 25%"). */
  yearlyPct: 25,
  /** Campaign label shown on banners. Not a coupon: there is nothing to type. */
  code: "DIWALI26",
  endLabel: "15 Nov 2026",
  endLabelShort: "15 Nov",
} as const;

export type DiwaliPhase = "countdown" | "live" | "over";

export function diwaliPhase(now: number = Date.now()): DiwaliPhase {
  if (now < DIWALI.launchAt) return "countdown";
  if (now <= DIWALI.offerEndsAt) return "live";
  return "over";
}

/** The Razorpay Offer id, or null when the campaign discount isn't configured. */
export function diwaliOfferId(): string | null {
  // Literal property access so Next inlines it into client bundles.
  const id = process.env.NEXT_PUBLIC_RAZORPAY_DIWALI_OFFER_ID?.trim();
  return id ? id : null;
}

/** True while the extra yearly discount is both in its window and configured. */
export function isDiwaliOfferLive(now: number = Date.now()): boolean {
  return diwaliPhase(now) === "live" && diwaliOfferId() !== null;
}

export interface DiwaliEligibilityArgs {
  intervalMonths: number;
  currency: "INR" | "USD";
  trial: boolean;
}

/** Whether a checkout of this shape gets the Diwali offer right now. Yearly,
 *  INR (Razorpay offers are configured in INR), and not a free trial (the
 *  trial is monthly-only anyway, and its first charge is deferred). */
export function diwaliOfferApplies(args: DiwaliEligibilityArgs, now: number = Date.now()): boolean {
  return isDiwaliOfferLive(now) && args.intervalMonths === 12 && args.currency === "INR" && !args.trial;
}

/** The offer id to send on Razorpay subscription create, or undefined. */
export function diwaliOfferFor(args: DiwaliEligibilityArgs, now: number = Date.now()): string | undefined {
  return diwaliOfferApplies(args, now) ? (diwaliOfferId() ?? undefined) : undefined;
}

/** The discount shown in the checkout summary, in minor units. */
export function diwaliDiscountMinor(priceMinor: number): number {
  return Math.round((priceMinor * DIWALI.extraPct) / 100);
}
