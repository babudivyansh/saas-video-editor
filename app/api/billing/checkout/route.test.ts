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
vi.mock("@/lib/coupons", () => ({ validateCoupon: vi.fn() }));
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
const findUniquePlan = vi.fn(async () => SUB_PLAN);
const findUniqueUser = vi.fn(async () => ({ trialUsedAt: new Date(), subscriptionEndsAt }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: (...a: unknown[]) => (findUniquePlan as unknown as (...x: unknown[]) => unknown)(...a),
      findMany: vi.fn(async () => []),
    },
    user: { findUnique: (...a: unknown[]) => (findUniqueUser as unknown as (...x: unknown[]) => unknown)(...a) },
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
