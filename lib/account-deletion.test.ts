import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: hard-delete never cancelled a Razorpay subscription, so a
// razorpaySubscriptionId could theoretically survive the User row's deletion
// (e.g. a trial-only account with zero Purchase rows) with no one able to
// reach Billing to stop it afterward.

let purchaseCount = 0;
let userForCancel: { razorpaySubscriptionId: string | null } | null = { razorpaySubscriptionId: "sub_1" };
const transaction = vi.fn(async () => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchase: { count: vi.fn(async () => purchaseCount) },
    user: { findUnique: vi.fn(async () => userForCancel), delete: vi.fn(async () => ({})) },
    commission: { deleteMany: vi.fn(async () => ({})) },
    referral: { deleteMany: vi.fn(async () => ({})) },
    affiliate: { deleteMany: vi.fn(async () => ({})) },
    $transaction: (...a: unknown[]) => (transaction as unknown as (...x: unknown[]) => unknown)(...a),
  },
}));

vi.mock("@/lib/auth", () => ({ invalidateAllSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn(async () => {}) } }));

const cancelRazorpaySubscriptionBestEffort = vi.fn(async () => {});
vi.mock("@/lib/billing/cancel-on-account-lifecycle", () => ({
  cancelRazorpaySubscriptionBestEffort: (...a: unknown[]) =>
    (cancelRazorpaySubscriptionBestEffort as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { hardDeleteUserAccount } = await import("./account-deletion");

beforeEach(() => {
  purchaseCount = 0;
  userForCancel = { razorpaySubscriptionId: "sub_1" };
  vi.clearAllMocks();
});

describe("hardDeleteUserAccount", () => {
  it("cancels the Razorpay subscription before deleting the user row when present", async () => {
    const result = await hardDeleteUserAccount("u1");
    expect(result.ok).toBe(true);
    expect(cancelRazorpaySubscriptionBestEffort).toHaveBeenCalledWith("sub_1", "u1", "delete");
    expect(transaction).toHaveBeenCalled();
  });

  it("still deletes the account when there is no subscription to cancel", async () => {
    userForCancel = { razorpaySubscriptionId: null };
    const result = await hardDeleteUserAccount("u1");
    expect(result.ok).toBe(true);
    expect(cancelRazorpaySubscriptionBestEffort).not.toHaveBeenCalled();
  });

  it("still refuses deletion on billing history, without attempting a Razorpay cancel", async () => {
    purchaseCount = 1;
    const result = await hardDeleteUserAccount("u1");
    expect(result.ok).toBe(false);
    expect(cancelRazorpaySubscriptionBestEffort).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
