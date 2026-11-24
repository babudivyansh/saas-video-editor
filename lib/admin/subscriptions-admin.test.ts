import { describe, expect, it, vi } from "vitest";

// How Admin → Subscriptions says a renewal or trial was cancelled: in Clipiro
// (an event with a reason) or only by Razorpay (mandate revoked at the bank /
// UPI app). And that trials are never shown as paying subscribers.

const NOW = new Date("2026-11-24T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const user = (id: string, o: Record<string, unknown>) => ({
  id, email: `${id}@x.co`, name: null, credits: 0, monthlyCredits: 0, minutes: 0, monthlyMinutes: 0,
  subscriptionEndsAt: at(10), subscriptionCancelledAt: null, trialEndsAt: null, paymentFailedAt: null,
  nextRefillAt: null, planId: "p", razorpaySubscriptionId: `sub_${id}`, plan: { id: "p", name: "Pro", slug: "pro" }, ...o,
});

const USERS = [
  user("trial", { trialEndsAt: at(2), subscriptionEndsAt: at(2) }),
  user("inapp", { trialEndsAt: at(2), subscriptionCancelledAt: at(-1) }),
  user("revoked", { trialEndsAt: at(2), subscriptionCancelledAt: at(-1) }),
  user("prepaid", { subscriptionCancelledAt: at(-1), razorpaySubscriptionId: null }),
  user("paying", {}),
];
const EVENTS = [
  { subscriptionId: "sub_inapp", reason: "user_requested_trial" },
  { subscriptionId: "sub_inapp", reason: null },
  { subscriptionId: "sub_revoked", reason: null },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => USERS), count: vi.fn(async () => USERS.length) },
    subscriptionEvent: { findMany: vi.fn(async () => EVENTS) },
  },
}));
vi.mock("@/lib/billing/trial-history", () => ({ listTrials: vi.fn(), summariseTrials: vi.fn() }));

const { listSubscribers } = await import("./subscriptions-admin");

describe("listSubscribers", () => {
  it("labels status and how each cancellation happened", async () => {
    const { rows } = await listSubscribers({ page: 1, limit: 50, now: NOW });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.trial).toMatchObject({ billingStatus: "trial", cancelSource: null });
    expect(by.inapp).toMatchObject({ billingStatus: "trial_cancelled", cancelSource: "in_app", cancelDetail: "by the customer" });
    expect(by.revoked).toMatchObject({ billingStatus: "trial_cancelled", cancelSource: "external" });
    expect(by.prepaid).toMatchObject({ billingStatus: "paid_cancelling", cancelSource: "in_app", recurring: false });
    expect(by.paying).toMatchObject({ billingStatus: "paid", cancelSource: null, trialEndsAt: null });
  });
});
