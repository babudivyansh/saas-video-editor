import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// The client-side backup for starting a free trial: it must not depend on the
// subscription.authenticated webhook, must not be forgeable, and must not let
// one account claim another's subscription.

const SECRET = "test_key_secret";
vi.mock("@/lib/env", () => ({ env: { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "test_key_secret" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));

type Sub = { id: string; status: string; start_at: number; notes: Record<string, string> };
let fetched: Sub;
const subscriptionsFetch = vi.fn(async () => fetched);
vi.mock("razorpay", () => ({
  default: class { subscriptions = { fetch: (...a: unknown[]) => (subscriptionsFetch as unknown as (...x: unknown[]) => unknown)(...a) }; },
}));

const startTrial = vi.fn(async () => ({ status: "started" as const }));
vi.mock("@/lib/billing/trial", () => ({
  startTrialOnAuthentication: (...a: unknown[]) => (startTrial as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { POST } = await import("./route");

const sign = (payment: string, sub: string) => crypto.createHmac("sha256", SECRET).update(`${payment}|${sub}`).digest("hex");
function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/billing/verify-subscription", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}
const valid = () => ({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: sign("pay_1", "sub_1") });

beforeEach(() => {
  vi.clearAllMocks();
  fetched = { id: "sub_1", status: "authenticated", start_at: 1_800_000_000, notes: { userId: "u1", planId: "sub_pro_1mo", trial: "1" } };
  startTrial.mockResolvedValue({ status: "started" });
});

describe("POST /api/billing/verify-subscription", () => {
  it("starts the trial right away for an authenticated trial subscription", async () => {
    const res = await post(valid());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "started" });
    expect(subscriptionsFetch).toHaveBeenCalledWith("sub_1");
    // Razorpay's copy — with its notes and start_at — is what's used, not the body.
    expect(startTrial).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_1", start_at: 1_800_000_000 }));
  });

  it("is a no-op when the webhook already started it", async () => {
    startTrial.mockResolvedValueOnce({ status: "already-started" } as never);
    const res = await post(valid());
    expect(await res.json()).toEqual({ status: "already-started" });
  });

  it("rejects a forged signature without contacting Razorpay", async () => {
    const res = await post({ ...valid(), razorpay_signature: sign("pay_1", "sub_OTHER") });
    expect(res.status).toBe(400);
    expect(subscriptionsFetch).not.toHaveBeenCalled();
    expect(startTrial).not.toHaveBeenCalled();
  });

  it("refuses another account's subscription", async () => {
    fetched.notes.userId = "someone-else";
    const res = await post(valid());
    expect(res.status).toBe(403);
    expect(startTrial).not.toHaveBeenCalled();
  });

  it("leaves a paid (non-trial) subscription to the webhooks", async () => {
    fetched.notes.trial = "0";
    fetched.status = "active";
    const res = await post(valid());
    expect(await res.json()).toEqual({ status: "pending" });
    expect(startTrial).not.toHaveBeenCalled();
  });

  it("waits while the mandate is not yet authenticated", async () => {
    fetched.status = "created";
    const res = await post(valid());
    expect(await res.json()).toEqual({ status: "pending", subscriptionStatus: "created" });
    expect(startTrial).not.toHaveBeenCalled();
  });

  it("400s on missing fields", async () => {
    const res = await post({ razorpay_payment_id: "pay_1" });
    expect(res.status).toBe(400);
  });

  it("reports a 500 (webhook still the fallback) if the grant throws", async () => {
    startTrial.mockRejectedValueOnce(new Error("db down"));
    const res = await post(valid());
    expect(res.status).toBe(500);
  });
});
