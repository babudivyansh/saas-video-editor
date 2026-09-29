// POST /api/billing/verify — the primary one-time-purchase fulfilment path
// (the webhook is the backup). It had no tests: signature check, the
// cross-account guard and the provider-failure path are all money paths.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const SECRET = "rzp_secret_test";
let authUser: { userId: string } | null = { userId: "u1" };
const ordersFetch = vi.hoisted(() => vi.fn());
const fulfillPayment = vi.hoisted(() => vi.fn(async () => ({ fulfilled: true, alreadyProcessed: false })));

vi.mock("@/lib/env", () => ({ env: { RAZORPAY_KEY_ID: "rzp_key", RAZORPAY_KEY_SECRET: SECRET } }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/fulfillment", () => ({ fulfillPayment }));
vi.mock("razorpay", () => ({ default: class { orders = { fetch: ordersFetch }; } }));

const { POST } = await import("./route");

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/billing/verify", { method: "POST", body: JSON.stringify(body) }));
}
const valid = () => ({ razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: sign("order_1", "pay_1") });

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1" };
  ordersFetch.mockResolvedValue({ notes: { userId: "u1", planId: "pack-500" }, amount: 50000, amount_paid: 40000, currency: "INR" });
});

describe("POST /api/billing/verify", () => {
  it("requires a session", async () => {
    authUser = null;
    expect((await post(valid())).status).toBe(401);
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    expect((await post({ razorpay_payment_id: "pay_1" })).status).toBe(400);
  });

  it("rejects a forged or mismatched signature without asking Razorpay", async () => {
    const res = await post({ ...valid(), razorpay_signature: sign("order_1", "pay_OTHER") });
    expect(res.status).toBe(400);
    expect(ordersFetch).not.toHaveBeenCalled();
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("refuses to fulfil another account's order", async () => {
    ordersFetch.mockResolvedValue({ notes: { userId: "someone-else" }, amount: 50000 });
    expect((await post(valid())).status).toBe(403);
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("reports a provider failure as 502 and fulfils nothing", async () => {
    ordersFetch.mockRejectedValue(new Error("razorpay down"));
    expect((await post(valid())).status).toBe(502);
    expect(fulfillPayment).not.toHaveBeenCalled();
  });

  it("fulfils with the amount actually paid (a coupon discount), from Razorpay's order", async () => {
    const res = await post(valid());
    expect(res.status).toBe(200);
    expect(fulfillPayment).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: "pay_1", orderId: "order_1", amountInPaise: 40000, currency: "INR",
      notes: expect.objectContaining({ userId: "u1" }),
    }));
    expect(await res.json()).toMatchObject({ success: true, fulfilled: true });
  });

  it("is safe to call twice — the second answers alreadyProcessed", async () => {
    fulfillPayment.mockResolvedValueOnce({ fulfilled: true, alreadyProcessed: false }).mockResolvedValueOnce({ fulfilled: false, alreadyProcessed: true });
    await post(valid());
    const second = await (await post(valid())).json();
    expect(second).toMatchObject({ fulfilled: false, alreadyProcessed: true });
  });
});
