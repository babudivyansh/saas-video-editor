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
let purchaseCount = 0;
const cancelled: Array<{ subId: string; reason: string }> = [];

vi.mock("@/lib/billing/subscription-switch", () => ({
  cancelExistingSubscriptionForSwitch: vi.fn(async (_userId: string, subId: string, reason = "plan_switch") => {
    cancelled.push({ subId, reason });
    return { ok: true };
  }),
}));

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
          ? { id: "plan-pro", slug: "sub_pro_1mo", kind: "subscription", tier: "pro", intervalMonths: 1, monthlyCredits: 160, credits: 160 }
          : where.slug === "sub_pro_12mo"
            ? { id: "plan-pro-yr", slug: "sub_pro_12mo", kind: "subscription", tier: "pro", intervalMonths: 12, monthlyCredits: 160, credits: 1920 }
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
    purchase: { count: vi.fn(async () => purchaseCount) },
    subscriptionEvent: { create: vi.fn(async () => ({})) },
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
  purchaseCount = 0;
  cancelled.length = 0;
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

// The trial starts when the mandate is AUTHENTICATED (day 0), not on
// activation (day 7, alongside the first charge) — see lib/billing/trial.ts.
describe("subscription.authenticated (7-day trial)", () => {
  const START_AT = Math.floor(Date.now() / 1000) + 7 * 86400;
  const authenticated = (subId = "sub_t", notes: Record<string, string> = {}) => ({
    event: "subscription.authenticated",
    payload: { subscription: { entity: {
      id: subId, start_at: START_AT, notes: { userId: "u1", planId: "sub_pro_1mo", trial: "1", ...notes },
    } } },
  });

  it("starts the trial immediately: Pro access until the first charge, 25 credits once", async () => {
    const res = await post(authenticated());
    expect(res.status).toBe(200);
    expect(user).toMatchObject({ planId: "plan-pro", razorpaySubscriptionId: "sub_t", monthlyCredits: 160 });
    expect(user.subscriptionEndsAt).toEqual(new Date(START_AT * 1000));
    expect(user.trialEndsAt).toEqual(new Date(START_AT * 1000));
    expect(user.trialUsedAt).toBeInstanceOf(Date);
    expect(grants).toEqual([{ amount: 25, reason: "grant:trial" }]);
    expect(cancelled).toEqual([]);
  });

  it("is idempotent across a redelivered authentication — and never cancels its own trial", async () => {
    await post(authenticated());
    grants.length = 0;
    const res = await post(authenticated());
    expect(res.status).toBe(200);
    expect(grants).toEqual([]);
    expect(cancelled).toEqual([]);
  });

  it("cancels a trial for an account that has paid before, granting nothing", async () => {
    purchaseCount = 1;
    await post(authenticated());
    expect(grants).toEqual([]);
    expect(user.planId).toBeNull();
    expect(cancelled).toEqual([{ subId: "sub_t", reason: "trial_ineligible" }]);
  });

  it("cancels a second, parallel trial subscription after the first has started", async () => {
    await post(authenticated("sub_first"));
    grants.length = 0;
    await post(authenticated("sub_second"));
    expect(grants).toEqual([]);
    expect(user.razorpaySubscriptionId).toBe("sub_first");
    expect(cancelled).toEqual([{ subId: "sub_second", reason: "trial_ineligible" }]);
  });

  it("cancels a trial on a non-monthly plan", async () => {
    await post(authenticated("sub_yr", { planId: "sub_pro_12mo" }));
    expect(grants).toEqual([]);
    expect(cancelled).toEqual([{ subId: "sub_yr", reason: "trial_ineligible" }]);
  });

  it("ignores a non-trial subscription (it starts on activation)", async () => {
    await post(authenticated("sub_paid", { trial: "0" }));
    expect(grants).toEqual([]);
    expect(user.planId).toBeNull();
    expect(cancelled).toEqual([]);
  });

  it("then on day-7 activation ends the trial without granting it again", async () => {
    await post(authenticated("sub_t"));
    grants.length = 0;
    await post(activated("sub_t"));
    expect(grants).toEqual([]);
    expect(user.trialEndsAt).toBeNull();
    expect(user.planId).toBe("plan-pro");
  });

  it("returns 500 so Razorpay retries when the trial grant fails", async () => {
    updateShouldFail = true;
    const res = await post(authenticated());
    expect(res.status).toBe(500);
    updateShouldFail = false;
    expect((await post(authenticated())).status).toBe(200);
    expect(grants).toEqual([{ amount: 25, reason: "grant:trial" }]);
  });
});
