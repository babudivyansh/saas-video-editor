import { prisma } from "@/lib/prisma";

// Single source of truth for coupon validation + discount math. Reused by the
// /api/coupons/validate preview endpoint and the billing checkout route so the
// price the user sees always matches what the order is created with.

const RAZORPAY_MIN_PAISE = 100; // Razorpay rejects orders below ₹1.

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

  // Never discount below the Razorpay minimum, and never go negative.
  const maxDiscount = Math.max(0, args.amountInPaise - RAZORPAY_MIN_PAISE);
  discountInPaise = Math.min(Math.max(0, discountInPaise), maxDiscount);

  const finalPaise = args.amountInPaise - discountInPaise;
  const label =
    coupon.discountType === "percent"
      ? `${coupon.discountValue}% off`
      : `₹${Math.round(coupon.discountValue / 100).toLocaleString("en-IN")} off`;

  return { ok: true, couponId: coupon.id, code: coupon.code, discountInPaise, finalPaise, label };
}
