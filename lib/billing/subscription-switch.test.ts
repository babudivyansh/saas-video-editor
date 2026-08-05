import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the plan-switch double-billing bug: checkout used to
// call subscriptions.create unconditionally, so a user switching plans ended
// up with two live Razorpay subscriptions once the activation webhook
// overwrote their single razorpaySubscriptionId column.

const cancelMock = vi.fn(async () => ({}));

vi.mock("razorpay", () => ({
  default: class {
    subscriptions = { cancel: cancelMock };
  },
}));

vi.mock("@/lib/env", () => ({
  env: { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

let events: Array<{ userId: string; subscriptionId: string; type: string; reason?: string }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionEvent: {
      create: vi.fn(async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      }),
    },
  },
}));

const { cancelExistingSubscriptionForSwitch } = await import("./subscription-switch");

beforeEach(() => {
  events = [];
  cancelMock.mockClear();
  cancelMock.mockImplementation(async () => ({}));
});

describe("cancelExistingSubscriptionForSwitch", () => {
  it("does nothing when the user has no existing subscription", async () => {
    const result = await cancelExistingSubscriptionForSwitch("u1", null);
    expect(result).toEqual({ ok: true });
    expect(cancelMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it("cancels the existing subscription immediately (not at cycle end) before allowing a switch", async () => {
    const result = await cancelExistingSubscriptionForSwitch("u1", "sub_old");
    expect(result).toEqual({ ok: true });
    expect(cancelMock).toHaveBeenCalledWith("sub_old", false);
  });

  it("records a plan_switch SubscriptionEvent on success", async () => {
    await cancelExistingSubscriptionForSwitch("u1", "sub_old");
    expect(events).toEqual([
      { userId: "u1", subscriptionId: "sub_old", type: "cancelled", reason: "plan_switch" },
    ]);
  });

  it("blocks the switch and does not swallow the error when Razorpay cancel fails", async () => {
    cancelMock.mockImplementationOnce(async () => {
      throw new Error("Razorpay unreachable");
    });
    const result = await cancelExistingSubscriptionForSwitch("u1", "sub_old");
    expect(result).toEqual({
      ok: false,
      error: "Couldn't switch plans right now — please try again.",
      status: 502,
    });
    // No event should be recorded for a cancellation that never happened.
    expect(events).toHaveLength(0);
  });
});
