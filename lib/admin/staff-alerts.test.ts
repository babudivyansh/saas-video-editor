import { beforeEach, describe, expect, it, vi } from "vitest";

const purchaseCount = vi.fn(async () => 1);
const failedRuns = vi.fn(async (): Promise<{ failureReason: string | null }[]> => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchase: { count: purchaseCount, findUnique: vi.fn(async () => ({ userId: "u1", amountInPaise: 79900, currency: "INR" })) },
    user: { findUnique: vi.fn(async () => ({ email: "payer@x.co", plan: { name: "Creator" } })) },
    project: { findMany: failedRuns },
  },
}));
const claimed = new Set<string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    setNx: vi.fn(async (k: string) => {
      if (claimed.has(k)) return false;
      claimed.add(k);
      return true;
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const sendAdminStaffAlertEmail = vi.fn(async (_to: string, _d: { title: string }) => ({ status: "sent", channel: "resend", messageId: "m" }));
vi.mock("@/lib/email", () => ({ sendAdminStaffAlertEmail }));
let moneyAlerts = true;
vi.mock("@/lib/admin/signup-alerts", () => ({
  getSignupAlertSettings: vi.fn(async () => ({ signupMode: "daily", moneyAlerts, recipients: [], mutedAdmins: [] })),
  signupAlertRecipients: vi.fn(async () => ["a1@clipiro.com"]),
  sendToEach: async (to: string[], _tag: string, send: (a: string) => Promise<unknown>) => Promise.all(to.map(send)),
}));

const { alertIfFirstPayment, alertRefund, alertRenewalFailed, noteAutoClipFailure } = await import("./staff-alerts");
const titles = () => sendAdminStaffAlertEmail.mock.calls.map((c) => c[1].title);

beforeEach(() => {
  vi.clearAllMocks();
  claimed.clear();
  moneyAlerts = true;
});

describe("staff alerts", () => {
  it("alerts on a user's first paid purchase, once", async () => {
    await alertIfFirstPayment({ userId: "u1", paymentId: "pay_1", amountInPaise: 79900, currency: "INR" });
    await alertIfFirstPayment({ userId: "u1", paymentId: "pay_1", amountInPaise: 79900, currency: "INR" });
    expect(titles()).toEqual(["First payment: payer@x.co"]);
  });

  it("stays quiet for a repeat payment", async () => {
    purchaseCount.mockResolvedValueOnce(2);
    await alertIfFirstPayment({ userId: "u1", paymentId: "pay_2", amountInPaise: 79900 });
    expect(sendAdminStaffAlertEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when money alerts are off", async () => {
    moneyAlerts = false;
    await alertRenewalFailed({ subscriptionId: "sub_1", userId: "u1", reason: "card declined" });
    expect(sendAdminStaffAlertEmail).not.toHaveBeenCalled();
  });

  // Razorpay sends refund.processed AND payment.refunded for one refund.
  it("sends one email per refund id", async () => {
    await alertRefund({ paymentId: "pay_1", refundId: "rfnd_1", partial: false });
    await alertRefund({ paymentId: "pay_1", refundId: "rfnd_1", partial: false });
    expect(titles()).toEqual(["Refund: payer@x.co"]);
  });

  it("flags a burst of AutoClip failures, not a single one", async () => {
    failedRuns.mockResolvedValueOnce([{ failureReason: "x" }]);
    await noteAutoClipFailure();
    expect(sendAdminStaffAlertEmail).not.toHaveBeenCalled();

    failedRuns.mockResolvedValue([{ failureReason: "download" }, { failureReason: "download" }, { failureReason: null }]);
    await noteAutoClipFailure();
    await noteAutoClipFailure();
    expect(titles()).toEqual(["3 AutoClip runs failed in the last hour"]);
  });
});
