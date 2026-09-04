import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: deactivate never cancelled a Razorpay subscription, so a user
// who deactivated with an active plan kept being auto-charged for up to
// PURGE_WINDOW_DAYS while locked out of login (unable to reach Billing).

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

const invalidateAllSessions = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  invalidateAllSessions,
}));

let userRow: { passwordHash: string; razorpaySubscriptionId: string | null } = {
  passwordHash: "hash",
  razorpaySubscriptionId: "sub_1",
};
const findUnique = vi.fn(async () => userRow);
const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => (findUnique as unknown as (...x: unknown[]) => unknown)(...a),
      update: (...a: unknown[]) => (update as unknown as (...x: unknown[]) => unknown)(...a),
    },
  },
}));

vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true) } }));

const cancelRazorpaySubscriptionBestEffort = vi.fn(async () => {});
vi.mock("@/lib/billing/cancel-on-account-lifecycle", () => ({
  cancelRazorpaySubscriptionBestEffort: (...a: unknown[]) =>
    (cancelRazorpaySubscriptionBestEffort as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  userRow = { passwordHash: "hash", razorpaySubscriptionId: "sub_1" };
  vi.clearAllMocks();
});

describe("POST /api/account/deactivate", () => {
  it("deactivates, invalidates sessions, and cancels the Razorpay subscription", async () => {
    const res = await POST(post({ password: "correct" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deactivatedAt: expect.any(Date) }),
    }));
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1");
    expect(cancelRazorpaySubscriptionBestEffort).toHaveBeenCalledWith("sub_1", "u1", "deactivate");
  });

  it("still deactivates successfully when the user has no subscription", async () => {
    userRow.razorpaySubscriptionId = null;
    const res = await POST(post({ password: "correct" }));
    expect(res.status).toBe(200);
    expect(cancelRazorpaySubscriptionBestEffort).not.toHaveBeenCalled();
  });
});
