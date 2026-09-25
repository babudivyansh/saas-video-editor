import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Cancelling inside the 7-day trial must cancel the Razorpay subscription
// OUTRIGHT: it is still `authenticated` (no billing cycle yet), and Razorpay
// refuses cancel-at-cycle-end for that state — so the old call failed and the
// customer was charged on day 7 anyway.

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/env", () => ({ env: { RAZORPAY_KEY_ID: "key", RAZORPAY_KEY_SECRET: "secret" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendSubscriptionCancelledEmail: vi.fn(async () => {}) }));

const cancel = vi.fn(async () => ({}));
vi.mock("razorpay", () => ({
  default: class {
    subscriptions = { cancel: (...a: unknown[]) => (cancel as unknown as (...x: unknown[]) => unknown)(...a) };
  },
}));

interface Row {
  subscriptionEndsAt: Date | null;
  razorpaySubscriptionId: string | null;
  subscriptionCancelledAt: Date | null;
  trialEndsAt: Date | null;
}
let row: Row;
const events: Array<{ reason: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ ...row })),
      update: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        Object.assign(row, data);
        return { ...row, email: "a@test.com", firstName: "A", name: null };
      }),
    },
    subscriptionEvent: { create: vi.fn(async ({ data }: { data: { reason: string } }) => { events.push(data); }) },
  },
}));

const { POST } = await import("./route");
const call = () => POST(new NextRequest("http://localhost/api/billing/cancel", { method: "POST" }));
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
});

describe("POST /api/billing/cancel", () => {
  it("cancels a trial subscription immediately, keeping access to the trial's end", async () => {
    const trialEnd = new Date(Date.now() + 4 * DAY);
    row = { subscriptionEndsAt: trialEnd, razorpaySubscriptionId: "sub_t", subscriptionCancelledAt: null, trialEndsAt: trialEnd };
    const res = await call();
    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith("sub_t", false);
    expect(row.subscriptionEndsAt).toEqual(trialEnd);
    expect(row.subscriptionCancelledAt).toBeInstanceOf(Date);
    expect(events).toEqual([expect.objectContaining({ reason: "user_requested_trial" })]);
  });

  it("cancels a paid subscription at cycle end", async () => {
    row = {
      subscriptionEndsAt: new Date(Date.now() + 20 * DAY), razorpaySubscriptionId: "sub_p",
      subscriptionCancelledAt: null, trialEndsAt: null,
    };
    const res = await call();
    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith("sub_p", true);
    expect(events).toEqual([expect.objectContaining({ reason: "user_requested" })]);
  });

  it("treats a trial whose end has passed as a paid subscription", async () => {
    row = {
      subscriptionEndsAt: new Date(Date.now() + 25 * DAY), razorpaySubscriptionId: "sub_p",
      subscriptionCancelledAt: null, trialEndsAt: new Date(Date.now() - 5 * DAY),
    };
    await call();
    expect(cancel).toHaveBeenCalledWith("sub_p", true);
  });
});
