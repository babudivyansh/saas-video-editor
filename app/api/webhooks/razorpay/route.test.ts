import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

// The webhook is the highest-risk file in billing — it is the path money
// actually arrives on — and had no test coverage at all. These cover signature
// verification and the subscription.activated branch, which used to run with
// no idempotency claim.

const WEBHOOK_SECRET = "whsec_test";

vi.mock("@/lib/env", () => ({
  env: { RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn(async () => {}) } }));
vi.mock("@/lib/email", () => ({ sendReviewPromptEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn(async () => false) }));
vi.mock("@/lib/reviews/prompt-triggers", () => ({
  evaluatePromptTrigger: vi.fn(async () => null),
  recordPrompt: vi.fn(async () => {}),
}));
vi.mock("@/lib/fulfillment", () => ({
  fulfillPayment: vi.fn(async () => ({ fulfilled: false, alreadyProcessed: false })),
  fulfillSubscriptionCharge: vi.fn(async () => ({ fulfilled: false, alreadyProcessed: false })),
}));

interface UserRow {
  id: string;
  trialUsedAt: Date | null;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelledAt: Date | null;
  razorpaySubscriptionId: string | null;
  planId: string | null;
  monthlyCredits: number;
}
let user: UserRow;
let events: Set<string>;
const grants: Array<{ amount: number; reason: string }> = [];
let updateShouldFail = false;

vi.mock("@/lib/credits", () => ({
  grantCredits: vi.fn(async ({ amount, reason }: { amount: number; reason: string }) => {
    grants.push({ amount, reason });
  }),
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === "sub_pro_1mo"
          ? { id: "plan-pro", slug: "sub_pro_1mo", monthlyCredits: 160, credits: 160 }
          : null),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === user.id ? { ...user } : null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (updateShouldFail) throw new Error("db down");
        for (const k of Object.keys(data)) (user as Record<string, unknown>)[k] = data[k];
        return { ...user };
      }),
    },
    razorpayEvent: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (events.has(data.id)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002", clientVersion: "0.0.0",
          });
        }
        events.add(data.id);
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      // Model a real transaction: roll the claim back if the body throws.
      const before = new Set(events);
      try {
        return await (arg as (tx: unknown) => Promise<unknown>)(client);
      } catch (e) {
        events = before;
        throw e;
      }
    }),
  };
  return { prisma: client };
});

const { POST } = await import("./route");

function post(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const sig = signature ?? crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return POST(new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body,
    headers: { "x-razorpay-signature": sig },
  }));
}

const activated = (subId = "sub_1") => ({
  event: "subscription.activated",
  payload: { subscription: { entity: { id: subId, notes: { userId: "u1", planId: "sub_pro_1mo", trial: "1" } } } },
});

beforeEach(() => {
  user = {
    id: "u1",
    trialUsedAt: null,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    subscriptionCancelledAt: null,
    razorpaySubscriptionId: null,
    planId: null,
    monthlyCredits: 0,
  };
  events = new Set();
  grants.length = 0;
  updateShouldFail = false;
  vi.clearAllMocks();
});

describe("razorpay webhook signature", () => {
  it("rejects a request with no signature header", async () => {
    const res = await POST(new NextRequest("http://localhost/api/webhooks/razorpay", {
      method: "POST", body: JSON.stringify(activated()),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a forged signature", async () => {
    const res = await post(activated(), "deadbeef");
    expect(res.status).toBe(400);
    expect(user.planId).toBeNull();
  });
});

describe("subscription.activated", () => {
  it("activates the plan and grants the trial once", async () => {
    const res = await post(activated());
    expect(res.status).toBe(200);
    expect(user.planId).toBe("plan-pro");
    expect(user.razorpaySubscriptionId).toBe("sub_1");
    expect(user.monthlyCredits).toBe(160);
    expect(grants).toEqual([{ amount: 25, reason: "grant:trial" }]);
  });

  // Regression: this branch had no RazorpayEvent claim, so a Razorpay retry or
  // a replayed signed body re-ran the whole block.
  it("is idempotent across a redelivered activation", async () => {
    await post(activated());
    grants.length = 0;
    const res = await post(activated());
    expect(res.status).toBe(200);
    expect(grants).toEqual([]); // no second trial grant
  });

  // Regression: subscriptionCancelledAt was nulled unconditionally, so a
  // redelivery silently resurrected a subscription the user had cancelled.
  it("does not resurrect a cancelled subscription on redelivery", async () => {
    await post(activated());
    const cancelledAt = new Date("2026-07-01");
    user.subscriptionCancelledAt = cancelledAt;
    await post(activated());
    expect(user.subscriptionCancelledAt).toEqual(cancelledAt);
  });

  // Regression: the term was reset to now+7d unconditionally, so a late
  // redelivery could pull an already-paid term back to a week.
  it("never shortens an existing paid term", async () => {
    const paidUntil = new Date(Date.now() + 60 * 86400_000);
    user.subscriptionEndsAt = paidUntil;
    await post(activated());
    expect(user.subscriptionEndsAt).toEqual(paidUntil);
  });

  // Regression: failures were swallowed and the route still returned 200, so
  // Razorpay never retried and a paid activation was lost for good.
  it("returns 500 and releases the claim when activation fails", async () => {
    updateShouldFail = true;
    const res = await post(activated());
    expect(res.status).toBe(500);

    // The retry must be able to succeed rather than being locked out by a
    // claim that outlived the failed attempt.
    updateShouldFail = false;
    const retry = await post(activated());
    expect(retry.status).toBe(200);
    expect(user.planId).toBe("plan-pro");
  });
});
