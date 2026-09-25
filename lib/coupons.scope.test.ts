import { beforeEach, describe, expect, it, vi } from "vitest";

// Where a coupon can be used. Subscriptions take no coupons (2026-09-25): a
// recurring plan is billed at its synced Razorpay plan amount, so a discount
// shown at checkout was never applied — the customer paid full price. This
// replaced the old subscription discount ceiling, which bounded exactly those
// (now retired) subscription coupons.

interface CouponRow {
  id: string; code: string; active: boolean; expiresAt: Date | null;
  discountType: string; discountValue: number; appliesTo: string;
  planSlugs: string[]; minAmountInPaise: number;
  maxRedemptions: number | null; timesRedeemed: number;
  perUserLimit: number; firstPurchaseOnly: boolean;
}
let coupon: CouponRow;
const findUnique = vi.fn(async () => coupon);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: { findUnique: () => findUnique() },
    couponRedemption: { count: vi.fn(async () => 0) },
    purchase: { count: vi.fn(async () => 0) },
  },
}));

const { validateCoupon, SUBSCRIPTION_COUPON_ERROR } = await import("./coupons");

const validate = (over: Partial<Parameters<typeof validateCoupon>[0]> = {}) =>
  validateCoupon({
    code: "TEST",
    userId: "u1",
    cartKind: "pack",
    planSlug: "pack_mini",
    amountInPaise: 59900,
    ...over,
  });

beforeEach(() => {
  findUnique.mockClear();
  coupon = {
    id: "c1", code: "TEST", active: true, expiresAt: null,
    discountType: "percent", discountValue: 15, appliesTo: "pack",
    planSlugs: [], minAmountInPaise: 0,
    maxRedemptions: null, timesRedeemed: 0,
    perUserLimit: 1, firstPurchaseOnly: false,
  };
});

describe("subscriptions take no coupons", () => {
  it.each(["all", "subscription", "pack"])("refuses a subscription cart whatever the coupon targets (%s)", async (appliesTo) => {
    coupon.appliesTo = appliesTo;
    const res = await validate({ cartKind: "subscription", planSlug: "sub_pro_1mo", amountInPaise: 219900 });
    expect(res).toEqual({ ok: false, error: SUBSCRIPTION_COUPON_ERROR });
    expect(findUnique).not.toHaveBeenCalled(); // refused before any lookup
  });

  it("treats a retired subscription-only coupon as invalid on a pack", async () => {
    coupon.appliesTo = "subscription"; // e.g. LAUNCH30
    const res = await validate();
    expect(res.ok).toBe(false);
  });
});

describe("pack coupons", () => {
  it("applies a pack coupon (TOPUP15)", async () => {
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.discountInPaise).toBe(Math.floor(59900 * 0.15));
    expect(res.label).toBe("15% off");
  });

  it("applies an 'all' coupon to a pack", async () => {
    coupon.appliesTo = "all";
    expect((await validate()).ok).toBe(true);
  });

  it("treats an add-on purchase as a pack", async () => {
    expect((await validate({ cartKind: "addon" })).ok).toBe(true);
  });

  it("still refuses to take an order below the Razorpay minimum", async () => {
    coupon.discountType = "fixed";
    coupon.discountValue = 99999999;
    const res = await validate();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.finalPaise).toBeGreaterThanOrEqual(100);
  });

  it("respects plan targeting", async () => {
    coupon.planSlugs = ["pack_pro"];
    expect((await validate({ planSlug: "pack_mini" })).ok).toBe(false);
    expect((await validate({ planSlug: "pack_pro", amountInPaise: 399900 })).ok).toBe(true);
  });
});
