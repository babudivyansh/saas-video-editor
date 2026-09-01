import { beforeEach, describe, expect, it, vi } from "vitest";

// A subscription's price per credit IS the margin on every generation that plan
// pays for, so a deep subscription discount reprices the whole credit economy for
// that customer. The 2026-09 pricing audit found nothing capping that: the live
// launch coupons (30% / 40%) applied to yearly SKUs, whose list price per credit
// is already the floor the model registry is priced against.

interface CouponRow {
  id: string; code: string; active: boolean; expiresAt: Date | null;
  discountType: string; discountValue: number; appliesTo: string;
  planSlugs: string[]; minAmountInPaise: number;
  maxRedemptions: number | null; timesRedeemed: number;
  perUserLimit: number; firstPurchaseOnly: boolean;
}
let coupon: CouponRow;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: { findUnique: vi.fn(async () => coupon) },
    couponRedemption: { count: vi.fn(async () => 0) },
    purchase: { count: vi.fn(async () => 0) },
  },
}));

const { validateCoupon, MAX_SUBSCRIPTION_DISCOUNT_PCT } = await import("./coupons");

const validate = (over: Partial<Parameters<typeof validateCoupon>[0]> = {}) =>
  validateCoupon({
    code: "TEST",
    userId: "u1",
    cartKind: "subscription",
    planSlug: "sub_studio_12mo",
    amountInPaise: 4019200, // Studio Yearly
    ...over,
  });

beforeEach(() => {
  coupon = {
    id: "c1", code: "TEST", active: true, expiresAt: null,
    discountType: "percent", discountValue: 30, appliesTo: "subscription",
    planSlugs: [], minAmountInPaise: 0,
    maxRedemptions: null, timesRedeemed: 0,
    perUserLimit: 1, firstPurchaseOnly: false,
  };
});

describe("subscription discount cap", () => {
  it("leaves a discount at or under the ceiling untouched", async () => {
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.discountInPaise).toBe(Math.floor(4019200 * 0.3));
    expect(res.label).toBe("30% off");
  });

  it("clamps a discount above the ceiling", async () => {
    coupon.discountValue = 80;
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.discountInPaise).toBe(Math.floor((4019200 * MAX_SUBSCRIPTION_DISCOUNT_PCT) / 100));
  });

  it("labels the discount actually applied, not the coupon's nominal value", async () => {
    // Quoting "80% off" against an order total that only moved 40% is the kind of
    // advertised-vs-charged mismatch this audit exists to remove.
    coupon.discountValue = 80;
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.label).toBe(`${MAX_SUBSCRIPTION_DISCOUNT_PCT}% off`);
    expect(res.finalPaise).toBe(4019200 - res.discountInPaise);
  });

  it("clamps a fixed-amount coupon too", async () => {
    coupon.discountType = "fixed";
    coupon.discountValue = 4000000; // ~99% off
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.discountInPaise).toBe(Math.floor((4019200 * MAX_SUBSCRIPTION_DISCOUNT_PCT) / 100));
  });

  it("does NOT cap credit packs — a pack discount only ever moves one top-up", async () => {
    coupon.appliesTo = "pack";
    coupon.discountType = "percent";
    coupon.discountValue = 80;
    const res = await validate({ cartKind: "pack", planSlug: "pack_mini", amountInPaise: 59900 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.discountInPaise).toBe(Math.floor(59900 * 0.8));
  });

  it("still refuses to take an order below the Razorpay minimum", async () => {
    coupon.appliesTo = "pack";
    coupon.discountType = "fixed";
    coupon.discountValue = 99999999;
    const res = await validate({ cartKind: "pack", planSlug: "pack_mini", amountInPaise: 59900 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.finalPaise).toBeGreaterThanOrEqual(100);
  });
});

describe("plan targeting (how the yearly SKUs are actually protected)", () => {
  it("rejects a monthly-only coupon on a yearly plan", async () => {
    coupon.planSlugs = ["sub_creator_1mo", "sub_pro_1mo", "sub_studio_1mo"];
    const res = await validate({ planSlug: "sub_studio_12mo" });
    expect(res.ok).toBe(false);
  });

  it("accepts it on the monthly plan it targets", async () => {
    coupon.planSlugs = ["sub_creator_1mo", "sub_pro_1mo", "sub_studio_1mo"];
    const res = await validate({ planSlug: "sub_studio_1mo", amountInPaise: 499900 });
    expect(res.ok).toBe(true);
  });
});
