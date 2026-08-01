import { beforeEach, describe, expect, it, vi } from "vitest";

// Dunning: a declined card previously produced no database write, no email and
// no in-app signal. These assert that it now leaves a trace, tells the user
// once rather than on every retry, and clears when a charge finally succeeds.

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  name: string | null;
  razorpaySubscriptionId: string | null;
  paymentFailedAt: Date | null;
  paymentFailureCount: number;
  paymentFailedEmailSentAt: Date | null;
}
let user: UserRow;
const events: Array<{ userId: string; subscriptionId: string; type: string; reason: string | null }> = [];
const notifications: Array<{ type: string; title: string }> = [];
const emails: Array<{ to: string; attempt: number; reason: string | null }> = [];
let categoryAllowed = true;

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notify", () => ({
  notify: vi.fn(async ({ type, title }: { type: string; title: string }) => { notifications.push({ type, title }); }),
}));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn(async () => categoryAllowed) }));
vi.mock("@/lib/email", () => ({
  sendPaymentFailedEmail: vi.fn(async (to: string, _n: string, reason: string | null, attempt: number) => {
    emails.push({ to, attempt, reason });
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { razorpaySubscriptionId?: string; id?: string } }) => {
        if (where.razorpaySubscriptionId) {
          return where.razorpaySubscriptionId === user.razorpaySubscriptionId ? { ...user } : null;
        }
        return where.id === user.id ? { ...user } : null;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.paymentFailureCount && typeof data.paymentFailureCount === "object") {
          user.paymentFailureCount += (data.paymentFailureCount as { increment: number }).increment;
        } else if (typeof data.paymentFailureCount === "number") {
          user.paymentFailureCount = data.paymentFailureCount;
        }
        for (const k of ["paymentFailedAt", "paymentFailedEmailSentAt"] as const) {
          if (k in data) user[k] = data[k] as Date | null;
        }
        return { ...user };
      }),
    },
    subscriptionEvent: {
      create: vi.fn(async ({ data }: { data: (typeof events)[number] }) => { events.push(data); return data; }),
    },
  },
}));

const { recordSubscriptionFailure, recordSubscriptionLifecycle, clearPaymentFailure } = await import("./dunning");

beforeEach(() => {
  user = {
    id: "u1",
    email: "u@test.co",
    firstName: "Ada",
    name: null,
    razorpaySubscriptionId: "sub_1",
    paymentFailedAt: null,
    paymentFailureCount: 0,
    paymentFailedEmailSentAt: null,
  };
  events.length = 0;
  notifications.length = 0;
  emails.length = 0;
  categoryAllowed = true;
  vi.clearAllMocks();
});

describe("recordSubscriptionFailure", () => {
  it("records the event, marks the user, notifies in-app and emails once", async () => {
    await recordSubscriptionFailure({
      subscriptionId: "sub_1", type: "payment_failed", reason: "card declined",
    });

    expect(events).toEqual([{ userId: "u1", subscriptionId: "sub_1", type: "payment_failed", reason: "card declined" }]);
    expect(user.paymentFailedAt).not.toBeNull();
    expect(user.paymentFailureCount).toBe(1);
    expect(notifications).toEqual([{ type: "billing_payment_failed", title: "Your payment didn't go through" }]);
    expect(emails).toHaveLength(1);
    expect(emails[0].reason).toBe("card declined");
  });

  // Razorpay retries a failed charge repeatedly, each firing a webhook. Every
  // retry should be recorded, but the customer should not be emailed each time.
  it("does not re-email within the cooldown, but still records the retry", async () => {
    await recordSubscriptionFailure({ subscriptionId: "sub_1", type: "payment_failed", reason: null });
    await recordSubscriptionFailure({ subscriptionId: "sub_1", type: "pending", reason: null });

    expect(events).toHaveLength(2);
    expect(user.paymentFailureCount).toBe(2);
    expect(emails).toHaveLength(1);
  });

  it("re-emails once the cooldown has passed", async () => {
    await recordSubscriptionFailure({ subscriptionId: "sub_1", type: "payment_failed", reason: null });
    user.paymentFailedEmailSentAt = new Date(Date.now() - 48 * 3600_000);
    await recordSubscriptionFailure({ subscriptionId: "sub_1", type: "payment_failed", reason: null });

    expect(emails).toHaveLength(2);
    expect(emails[1].attempt).toBe(2);
  });

  it("still records and notifies when the user has opted out of billing emails", async () => {
    categoryAllowed = false;
    await recordSubscriptionFailure({ subscriptionId: "sub_1", type: "payment_failed", reason: null });

    expect(events).toHaveLength(1);
    expect(notifications).toHaveLength(1); // in-app is not gated by email prefs
    expect(emails).toHaveLength(0);
  });

  // Same recovery as fulfillSubscriptionCharge: the local link can be missing
  // if the account lapsed while a renewal was still being retried.
  it("falls back to notes.userId when the subscription link is lost", async () => {
    user.razorpaySubscriptionId = null;
    await recordSubscriptionFailure({
      subscriptionId: "sub_1", notesUserId: "u1", type: "payment_failed", reason: null,
    });
    expect(events).toHaveLength(1);
    expect(user.paymentFailureCount).toBe(1);
  });

  it("no-ops for a subscription with no identifiable owner", async () => {
    await recordSubscriptionFailure({ subscriptionId: "sub_unknown", type: "payment_failed", reason: null });
    expect(events).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });
});

describe("recordSubscriptionLifecycle", () => {
  it("records a halt and tells the user, since retries are over", async () => {
    await recordSubscriptionLifecycle({ subscriptionId: "sub_1", type: "halted" });
    expect(events[0].type).toBe("halted");
    expect(notifications).toEqual([{ type: "billing_subscription_halted", title: "Your subscription is paused" }]);
  });

  it("records a pause without alarming the user", async () => {
    await recordSubscriptionLifecycle({ subscriptionId: "sub_1", type: "paused" });
    expect(events[0].type).toBe("paused");
    expect(notifications).toHaveLength(0);
  });
});

describe("clearPaymentFailure", () => {
  it("resets dunning state once a charge succeeds", async () => {
    user.paymentFailedAt = new Date();
    user.paymentFailureCount = 3;
    user.paymentFailedEmailSentAt = new Date();

    await clearPaymentFailure("u1");

    expect(user.paymentFailedAt).toBeNull();
    expect(user.paymentFailureCount).toBe(0);
    expect(user.paymentFailedEmailSentAt).toBeNull();
  });
});
