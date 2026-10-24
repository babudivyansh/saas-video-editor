import { describe, expect, it, vi } from "vitest";
import type Razorpay from "razorpay";
import { fingerprint, paymentIdentity, resolveTrialFingerprint, tokenIdentity } from "./trial-instrument";

const card = { network: "Visa", issuer: "HDFC", last4: "4242", expiry_month: 12, expiry_year: 2030 };

describe("instrument identity", () => {
  it("names a card by network, issuer, last 4 and expiry, ignoring case", () => {
    expect(paymentIdentity({ method: "card", card })).toBe("card|visa|hdfc|4242|12/2030");
    expect(paymentIdentity({ card: { ...card, network: "VISA", issuer: "hdfc" } })).toBe("card|visa|hdfc|4242|12/2030");
  });

  // last 4 + bank alone would collide for 1 in 10,000 real customers.
  it("refuses to fingerprint a card without its expiry", () => {
    expect(paymentIdentity({ card: { ...card, expiry_month: null } })).toBeNull();
    expect(paymentIdentity({ card: { ...card, expiry_year: undefined } })).toBeNull();
    expect(paymentIdentity({ card: { ...card, last4: "42" } })).toBeNull();
  });

  it("names a UPI ID exactly, from a payment or a saved token", () => {
    expect(paymentIdentity({ method: "upi", vpa: "Gaurav.Kumar@okhdfcbank" })).toBe("upi|gaurav.kumar@okhdfcbank");
    expect(paymentIdentity({ method: "upi", upi: { vpa: "a@ybl" } })).toBe("upi|a@ybl");
    expect(tokenIdentity({ method: "upi", vpa: { username: "a", handle: "ybl" } })).toBe("upi|a@ybl");
    expect(tokenIdentity({ method: "card", card })).toBe("card|visa|hdfc|4242|12/2030");
  });

  it("returns nothing for net banking / e-mandate", () => {
    expect(paymentIdentity({ method: "emandate" })).toBeNull();
  });

  it("stores an HMAC, not the card details", () => {
    const fp = fingerprint("card|visa|hdfc|4242|12/2030");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain("4242");
    expect(fingerprint("card|visa|hdfc|4242|12/2030")).toBe(fp);
  });
});

describe("resolveTrialFingerprint", () => {
  const rp = (overrides: Record<string, unknown> = {}) =>
    ({
      payments: { fetch: vi.fn(async () => ({ method: "card", card })) },
      customers: { fetchTokens: vi.fn(async () => ({ items: [] })) },
      ...overrides,
    }) as unknown as Razorpay;

  it("uses a payment it was handed without calling Razorpay", async () => {
    const client = rp();
    expect(await resolveTrialFingerprint(client, {}, { payment: { method: "upi", vpa: "a@ybl" } })).toBe(fingerprint("upi|a@ybl"));
    expect(client.payments.fetch).not.toHaveBeenCalled();
  });

  it("fetches a payment by id", async () => {
    expect(await resolveTrialFingerprint(rp(), {}, { paymentId: "pay_1" })).toBe(fingerprint("card|visa|hdfc|4242|12/2030"));
  });

  it("falls back to the customer's newest recurring token", async () => {
    const client = rp({
      customers: {
        fetchTokens: vi.fn(async () => ({
          items: [
            { method: "card", recurring: true, created_at: 100, card: { ...card, last4: "1111" } },
            { method: "card", recurring: true, created_at: 200, card },
          ],
        })),
      },
    });
    expect(await resolveTrialFingerprint(client, { customer_id: "cust_1" })).toBe(fingerprint("card|visa|hdfc|4242|12/2030"));
  });

  it("gives up quietly when Razorpay errors, so the trial isn't blocked by an outage", async () => {
    const client = rp({ payments: { fetch: vi.fn(async () => { throw new Error("down"); }) } });
    expect(await resolveTrialFingerprint(client, {}, { paymentId: "pay_1" })).toBeNull();
  });
});
