import { prisma } from "@/lib/prisma";

// Single source of truth for coupon validation + discount math. Reused by the
// /api/coupons/validate preview endpoint and the billing checkout route so the
// price the user sees always matches what the order is created with.

const RAZORPAY_MIN_PAISE = 100; // Razorpay rejects orders below ₹1.

/** Shown wherever a coupon meets a subscription cart. */
export const SUBSCRIPTION_COUPON_ERROR = "Coupons can't be used on subscription plans — they apply to credit packs.";

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

  // Subscriptions take no coupons (2026-09-25 decision). A recurring plan is a
  // Razorpay Subscription billed at its synced plan amount, so a discount
  // computed here was shown in the checkout modal and then never applied —
  // the customer was charged full price. Refused up front, for every
  // subscription cart, so the UI and the charge can't disagree again. This
  // retired the subscription-only launch coupons (LAUNCH30, FOUNDERS50) and the
  // subscription discount ceiling that bounded them.
  if (args.cartKind === "subscription") return { ok: false, error: SUBSCRIPTION_COUPON_ERROR };

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

  // Targeting. Only pack-type carts reach this point ("addon" purchases count
  // as packs); a coupon still marked subscription-only can no longer be
  // redeemed anywhere.
  if (coupon.appliesTo === "subscription") {
    return { ok: false, error: "This coupon is no longer valid." };
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

  // Never discount below the Razorpay minimum, and never go negative.
  const maxDiscount = Math.max(0, args.amountInPaise - RAZORPAY_MIN_PAISE);
  discountInPaise = Math.min(Math.max(0, discountInPaise), maxDiscount);

  const finalPaise = args.amountInPaise - discountInPaise;
  // Label the discount the customer actually receives. Quoting the coupon's
  // nominal value after the Razorpay-minimum clamp has trimmed it would show a
  // saving the order total doesn't match.
  const effectivePct = args.amountInPaise > 0 ? (discountInPaise / args.amountInPaise) * 100 : 0;
  const label =
    coupon.discountType === "percent"
      ? `${Math.round(effectivePct)}% off`
      : `₹${Math.round(discountInPaise / 100).toLocaleString("en-IN")} off`;

  return { ok: true, couponId: coupon.id, code: coupon.code, discountInPaise, finalPaise, label };
}
