// A webhook that answers 200 is never redelivered. These pin that real
// failures in the dunning, lifecycle and refund branches answer 500 instead,
// so Razorpay retries rather than the event being lost.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const SECRET = "whsec_test";
const recordSubscriptionFailure = vi.hoisted(() => vi.fn(async () => {}));
const recordSubscriptionLifecycle = vi.hoisted(() => vi.fn(async () => {}));
const refundPurchase = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("@/lib/env", () => ({ env: { RAZORPAY_WEBHOOK_SECRET: SECRET, RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/dunning", () => ({ recordSubscriptionFailure, recordSubscriptionLifecycle }));
vi.mock("@/lib/admin/billing", () => ({ refundPurchase }));
vi.mock("@/lib/fulfillment", () => ({ fulfillPayment: vi.fn(), fulfillSubscriptionCharge: vi.fn() }));
vi.mock("@/lib/billing/subscription-switch", () => ({ cancelExistingSubscriptionForSwitch: vi.fn() }));
vi.mock("@/lib/billing/trial", () => ({ startTrialOnAuthentication: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/credits", () => ({ grantCredits: vi.fn() }));
vi.mock("@/lib/reviews/prompt-triggers", () => ({ evaluatePromptTrigger: vi.fn(), recordPrompt: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendReviewPromptEmail: vi.fn() }));

const { POST } = await import("./route");

function post(payload: unknown) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  return POST(new NextRequest("http://localhost/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": sig } }));
}
const sub = { subscription: { entity: { id: "sub_1", notes: { userId: "u1" } } } };

beforeEach(() => vi.clearAllMocks());

describe("razorpay webhook retries", () => {
  it("answers 500 when the dunning write fails", async () => {
    recordSubscriptionFailure.mockRejectedValueOnce(new Error("db down"));
    expect((await post({ event: "payment.failed", payload: { ...sub, payment: { entity: {} } } })).status).toBe(500);
  });

  it("answers 500 when a lifecycle write fails", async () => {
    recordSubscriptionLifecycle.mockRejectedValueOnce(new Error("db down"));
    expect((await post({ event: "subscription.halted", payload: sub })).status).toBe(500);
  });

  it("answers 500 when mirroring a refund throws", async () => {
    refundPurchase.mockRejectedValueOnce(new Error("db down"));
    expect((await post({ event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_1" } } } })).status).toBe(500);
  });

  it("still answers 200 for a refund of a payment we never fulfilled", async () => {
    refundPurchase.mockResolvedValueOnce({ ok: false, error: "Purchase not found", status: 404 } as never);
    expect((await post({ event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_x" } } } })).status).toBe(200);
  });
});
