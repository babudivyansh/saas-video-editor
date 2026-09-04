import { beforeEach, describe, expect, it, vi } from "vitest";

const cancel = vi.fn(async () => ({}));
vi.mock("razorpay", () => ({
  default: class {
    subscriptions = { cancel };
  },
}));

const loggerError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

const subscriptionEventCreate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { subscriptionEvent: { create: (...a: unknown[]) => (subscriptionEventCreate as unknown as (...x: unknown[]) => unknown)(...a) } },
}));

vi.mock("@/lib/env", () => ({ env: { RAZORPAY_KEY_ID: "key", RAZORPAY_KEY_SECRET: "secret" } }));

const { cancelRazorpaySubscriptionBestEffort } = await import("./cancel-on-account-lifecycle");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelRazorpaySubscriptionBestEffort", () => {
  it("cancels at cycle-end (true) and records a SubscriptionEvent for deactivate", async () => {
    await cancelRazorpaySubscriptionBestEffort("sub_1", "u1", "deactivate");
    expect(cancel).toHaveBeenCalledWith("sub_1", true);
    expect(subscriptionEventCreate).toHaveBeenCalledWith({
      data: { userId: "u1", subscriptionId: "sub_1", type: "cancelled", reason: "account_deactivate" },
    });
  });

  it("does not record a SubscriptionEvent for delete (would be cascade-deleted immediately)", async () => {
    await cancelRazorpaySubscriptionBestEffort("sub_1", "u1", "delete");
    expect(cancel).toHaveBeenCalledWith("sub_1", true);
    expect(subscriptionEventCreate).not.toHaveBeenCalled();
  });

  it("swallows a Razorpay failure and logs instead of throwing", async () => {
    cancel.mockRejectedValueOnce(new Error("razorpay down"));
    await expect(cancelRazorpaySubscriptionBestEffort("sub_1", "u1", "deactivate")).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
    expect(subscriptionEventCreate).not.toHaveBeenCalled();
  });
});
