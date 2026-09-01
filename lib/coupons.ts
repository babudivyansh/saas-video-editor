import { prisma } from "@/lib/prisma";

// Single source of truth for coupon validation + discount math. Reused by the
// /api/coupons/validate preview endpoint and the billing checkout route so the
// price the user sees always matches what the order is created with.

const RAZORPAY_MIN_PAISE = 100; // Razorpay rejects orders below ₹1.

/**
 * Hard ceiling on how much of a SUBSCRIPTION order a coupon can take off,
 * whatever the coupon row says. See the rationale at the clamp site below.
 * Deliberately permissive enough for the live launch coupons (30% and 40%) —
 * it exists to bound the next one somebody creates in the admin panel, where
 * couponCreateSchema otherwise allows anything up to 100%.
 */
export const MAX_SUBSCRIPTION_DISCOUNT_PCT = 40;

export interface ValidateCouponArgs {
  code: string;
  userId: string;
  cartKind: "subscription" | "pack" | "addon"; // the base plan's kind
  planSlug: string;
  amountInPaise: number; // pre-discount order total
}

export type ValidateCouponResult =
  | {
      ok: true;
      couponId: string;
      code: string;
      discountInPaise: number;
      finalPaise: number;
      label: string;
    }
  | { ok: false; error: string };

export async function validateCoupon(args: ValidateCouponArgs): Promise<ValidateCouponResult> {
  const code = args.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) {
    return { ok: false, error: "This coupon code is not valid." };
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { ok: false, error: "This coupon has expired." };
  }

  if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { ok: false, error: "This coupon has reached its redemption limit." };
  }

  // Targeting by cart kind. "addon" purchases are treated like packs for coupon
  // purposes (a standalone Veo3 unlock). "all" matches everything.
  const cartGroup = args.cartKind === "subscription" ? "subscription" : "pack";
  if (coupon.appliesTo !== "all" && coupon.appliesTo !== cartGroup) {
    const target = coupon.appliesTo === "subscription" ? "subscription plans" : "credit top-ups";
    return { ok: false, error: `This coupon only applies to ${target}.` };
  }

  // Restrict to specific plan slugs if configured.
  if (coupon.planSlugs.length > 0 && !coupon.planSlugs.includes(args.planSlug)) {
    return { ok: false, error: "This coupon doesn't apply to the selected plan." };
  }

  if (args.amountInPaise < coupon.minAmountInPaise) {
    const min = `₹${Math.round(coupon.minAmountInPaise / 100).toLocaleString("en-IN")}`;
    return { ok: false, error: `This coupon requires a minimum order of ${min}.` };
  }

  // Per-user redemption limit.
  if (coupon.perUserLimit > 0) {
    const used = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId: args.userId },
    });
    if (used >= coupon.perUserLimit) {
      return { ok: false, error: "You've already used this coupon." };
    }
  }

  // First-purchase-only: reject if the user already has a captured purchase.
  if (coupon.firstPurchaseOnly) {
    const prior = await prisma.purchase.count({
      where: { userId: args.userId, status: "captured" },
    });
    if (prior > 0) {
      return { ok: false, error: "This code is only valid on your first purchase." };
    }
  }

  // Compute the discount.
  let discountInPaise =
    coupon.discountType === "percent"
      ? Math.floor((args.amountInPaise * coupon.discountValue) / 100)
      : coupon.discountValue;

  // Policy ceiling on subscription carts (2026-09 pricing audit). A plan's price
  // per credit IS the margin on every generation that plan pays for, so a deep
  // subscription discount reprices the whole credit economy for that customer —
  // unlike a pack discount, which only ever moves one top-up.
  //
  // Worked example that motivated this: Studio Yearly lists at ₹8.37/credit
  // ($0.0952, the floor the model registries are priced against). At 40% off it
  // becomes $0.057, and the affiliate program's 20% first-payment commission
  // takes it to ~$0.052 — at which Seedance 1080p bills 1.6x its provider cost
  // before GPU, S3 and transcription are counted at all. Capping the discount
  // keeps the worst realistic stack above 2x.
  //
  // This is a floor under the data, not a replacement for it: the launch coupons
  // are also scoped to monthly SKUs via Coupon.planSlugs (prisma/seed.ts), which
  // is what actually protects the yearly rows. This cap is what stops the next
  // hand-made coupon from quietly undoing that.
  if (cartGroup === "subscription") {
    const ceiling = Math.floor((args.amountInPaise * MAX_SUBSCRIPTION_DISCOUNT_PCT) / 100);
    discountInPaise = Math.min(discountInPaise, ceiling);
  }

  // Never discount below the Razorpay minimum, and never go negative.
  const maxDiscount = Math.max(0, args.amountInPaise - RAZORPAY_MIN_PAISE);
  discountInPaise = Math.min(Math.max(0, discountInPaise), maxDiscount);

  const finalPaise = args.amountInPaise - discountInPaise;
  // Label the discount the customer actually receives. Quoting the coupon's
  // nominal value after the cap has trimmed it would show a saving the order
  // total doesn't match.
  const effectivePct = args.amountInPaise > 0 ? (discountInPaise / args.amountInPaise) * 100 : 0;
  const label =
    coupon.discountType === "percent"
      ? `${Math.round(effectivePct)}% off`
      : `₹${Math.round(discountInPaise / 100).toLocaleString("en-IN")} off`;

  return { ok: true, couponId: coupon.id, code: coupon.code, discountInPaise, finalPaise, label };
}
