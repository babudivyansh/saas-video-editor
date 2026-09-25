import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// resumeFromPeriodEnd: set only by the billing dunning banner's "View plans"
// (a failed-payment retry). The new subscription should start at the user's
// current subscriptionEndsAt instead of billing today, since they already
// paid for time still remaining — unless that period has already lapsed, in
// which case checkout must fall through to an immediate start.

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/env", () => ({ env: { RAZORPAY_KEY_ID: "key", RAZORPAY_KEY_SECRET: "secret" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
const validateCoupon = vi.fn();
vi.mock("@/lib/coupons", () => ({
  validateCoupon: (...a: unknown[]) => (validateCoupon as unknown as (...x: unknown[]) => unknown)(...a),
  SUBSCRIPTION_COUPON_ERROR: "Coupons can't be used on subscription plans — they apply to credit packs.",
}));
vi.mock("@/lib/currency", () => ({ getPlanPriceMinor: vi.fn(async (_slug: string, paise: number) => paise) }));

const SUB_PLAN = {
  slug: "pro-monthly",
  active: true,
  kind: "subscription",
  tier: "pro",
  priceInPaise: 99900,
  credits: 1000,
  name: "Pro",
  razorpayPlanIdInr: "plan_inr_1",
  razorpayPlanIdUsd: null,
};

let subscriptionEndsAt: Date | null = null;
let purchaseCount = 0;
const findUniquePlan = vi.fn(async () => SUB_PLAN);
const findUniqueUser = vi.fn(async () => ({ trialUsedAt: new Date(), subscriptionEndsAt }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: (...a: unknown[]) => (findUniquePlan as unknown as (...x: unknown[]) => unknown)(...a),
      findMany: vi.fn(async () => []),
    },
    user: { findUnique: (...a: unknown[]) => (findUniqueUser as unknown as (...x: unknown[]) => unknown)(...a) },
    purchase: { count: vi.fn(async () => purchaseCount) },
  },
}));

const subscriptionsCreate = vi.fn(async () => ({ id: "sub_new" }));
vi.mock("razorpay", () => ({
  default: class {
    subscriptions = { create: subscriptionsCreate };
    orders = { create: vi.fn() };
  },
}));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  subscriptionEndsAt = null;
  purchaseCount = 0;
  vi.clearAllMocks();
  findUniquePlan.mockResolvedValue(SUB_PLAN);
  findUniqueUser.mockImplementation(async () => ({ trialUsedAt: new Date(), subscriptionEndsAt }));
  subscriptionsCreate.mockResolvedValue({ id: "sub_new" });
});

describe("POST /api/billing/checkout — resumeFromPeriodEnd", () => {
  it("passes start_at = subscriptionEndsAt when resumeFromPeriodEnd and the period is still in the future", async () => {
    subscriptionEndsAt = new Date(Date.now() + 5 * 86400_000);
    const res = await POST(post({ planId: "pro-monthly", resumeFromPeriodEnd: true }));
    expect(res.status).toBe(200);
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: Math.floor(subscriptionEndsAt.getTime() / 1000) }),
    );
  });

  it("starts immediately when resumeFromPeriodEnd is set but the period has already lapsed", async () => {
    subscriptionEndsAt = new Date(Date.now() - 86400_000);
    const res = await POST(post({ planId: "pro-monthly", resumeFromPeriodEnd: true }));
    expect(res.status).toBe(200);
    const call = subscriptionsCreate.mock.calls[0][0];
    expect(call.start_at).toBeUndefined();
  });

  it("starts immediately when resumeFromPeriodEnd is not set, even with an active period", async () => {
    subscriptionEndsAt = new Date(Date.now() + 5 * 86400_000);
    const res = await POST(post({ planId: "pro-monthly" }));
    expect(res.status).toBe(200);
    const call = subscriptionsCreate.mock.calls[0][0];
    expect(call.start_at).toBeUndefined();
  });
});

// The trial is a first-purchase offer on the monthly Pro plan. An ineligible
// request used to fall through to an ordinary subscription that charged the
// full price at once — after a modal that said "Due today ₹0".
describe("POST /api/billing/checkout — 7-day trial", () => {
  const fresh = () => findUniqueUser.mockImplementation(async () => ({ trialUsedAt: null, subscriptionEndsAt }));

  it("defers the first charge 7 days for a first-time customer", async () => {
    fresh();
    const res = await POST(post({ planId: "pro-monthly", trial: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).trial).toBe(true);
    const call = subscriptionsCreate.mock.calls[0][0] as { start_at: number; notes: { trial: string } };
    expect(call.notes.trial).toBe("1");
    expect(call.start_at - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(7 * 86400 - 5);
  });

  it.each([
    ["has used a trial", () => findUniqueUser.mockImplementation(async () => ({ trialUsedAt: new Date(), subscriptionEndsAt: null }))],
    ["has bought anything before", () => { fresh(); purchaseCount = 1; }],
    ["has an active plan", () => { subscriptionEndsAt = new Date(Date.now() + 86400_000); fresh(); }],
  ])("refuses with 409, creating nothing, when the account %s", async (_label, setup) => {
    setup();
    const res = await POST(post({ planId: "pro-monthly", trial: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("trial_ineligible");
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a trial on an annual plan", async () => {
    fresh();
    findUniquePlan.mockResolvedValue({ ...SUB_PLAN, intervalMonths: 12 } as typeof SUB_PLAN);
    const res = await POST(post({ planId: "pro-monthly", trial: true }));
    expect(res.status).toBe(409);
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });
});

// A subscription is billed at its synced Razorpay plan amount: add-ons and
// coupon discounts shown in the checkout modal were never charged or applied.
describe("POST /api/billing/checkout — subscription is exactly its plan", () => {
  it("refuses add-on packs on a subscription, creating nothing", async () => {
    const res = await POST(post({ planId: "pro-monthly", addonIds: ["pack_mini"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/can't be bundled/);
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a coupon on a subscription without consulting the coupon table", async () => {
    const res = await POST(post({ planId: "pro-monthly", couponCode: "LAUNCH30" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/subscription plans/);
    expect(validateCoupon).not.toHaveBeenCalled();
    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it("refuses them on an unsynced subscription plan too (the one-time order path)", async () => {
    findUniquePlan.mockResolvedValue({ ...SUB_PLAN, razorpayPlanIdInr: null } as unknown as typeof SUB_PLAN);
    const res = await POST(post({ planId: "pro-monthly", couponCode: "LAUNCH30" }));
    expect(res.status).toBe(400);
  });
});
