import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { BILLING_STATUSES, billingStatusOf, billingStatusWhere, type BillingFields } from "./billing-status";
import { cancelReasonLabel } from "./billing-status-labels";

const { trialOutcome, summariseTrials } = await import("./trial-history");

const NOW = new Date("2026-11-24T12:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const base: BillingFields = { planId: null, subscriptionEndsAt: null, subscriptionCancelledAt: null, trialEndsAt: null, paymentFailedAt: null };
const plan = { planId: "p", subscriptionEndsAt: at(20) };

describe("billingStatusOf", () => {
  it("tells a trial apart from a paying plan, although a trial sets subscriptionEndsAt too", () => {
    expect(billingStatusOf({ ...base, ...plan, trialEndsAt: at(2), subscriptionEndsAt: at(2) }, false, NOW)).toBe("trial");
    expect(billingStatusOf({ ...base, ...plan }, true, NOW)).toBe("paid");
  });

  it("marks a cancelled trial, whichever way it was cancelled", () => {
    expect(billingStatusOf({ ...base, ...plan, trialEndsAt: at(1), subscriptionCancelledAt: at(-1) }, false, NOW)).toBe("trial_cancelled");
  });

  it("splits running plans by cancelled renewal and failed payment", () => {
    expect(billingStatusOf({ ...base, ...plan, subscriptionCancelledAt: at(-2) }, true, NOW)).toBe("paid_cancelling");
    expect(billingStatusOf({ ...base, ...plan, paymentFailedAt: at(-1) }, true, NOW)).toBe("payment_failed");
  });

  it("treats a trial that has ended as not a trial", () => {
    expect(billingStatusOf({ ...base, trialEndsAt: at(-1) }, false, NOW)).toBe("free");
    expect(billingStatusOf({ ...base, planId: "p", subscriptionEndsAt: at(-3) }, true, NOW)).toBe("lapsed");
  });

  it("has a database filter for every status", () => {
    for (const s of BILLING_STATUSES) expect(billingStatusWhere(s, NOW)).toBeTruthy();
  });
});

describe("trialOutcome", () => {
  const ends = at(2);
  const ev = (type: string, days: number, reason: string | null = null) => ({ type, reason, createdAt: at(days) });

  it("is active until something happens", () => {
    expect(trialOutcome({ events: [], endsAt: ends, paidAfterStart: null, now: NOW }).outcome).toBe("active");
  });

  it("converts on the first charge", () => {
    expect(trialOutcome({ events: [ev("activated", 3)], endsAt: ends, paidAfterStart: null, now: at(4) }).outcome).toBe("converted");
    expect(trialOutcome({ events: [ev("charged", 3)], endsAt: ends, paidAfterStart: null, now: at(4) }).outcome).toBe("converted");
  });

  it("calls a cancel with a reason in-app, and shows who did it", () => {
    const o = trialOutcome({
      // Our event (with a reason) then Razorpay's webhook copy (without one).
      events: [ev("cancelled", -1, "user_requested_trial"), ev("cancelled", -1)],
      endsAt: ends, paidAfterStart: null, now: NOW,
    });
    expect(o).toMatchObject({ outcome: "cancelled_in_app", detail: "by the customer" });
  });

  it("calls a cancel only Razorpay saw a revoked mandate", () => {
    expect(trialOutcome({ events: [ev("cancelled", -1)], endsAt: ends, paidAfterStart: null, now: NOW }).outcome).toBe("mandate_revoked");
  });

  it("a cancel after conversion doesn't undo the conversion", () => {
    expect(trialOutcome({ events: [ev("charged", 3), ev("cancelled", 10, "user_requested")], endsAt: ends, paidAfterStart: null, now: at(11) }).outcome).toBe("converted");
  });

  it("records a failed first charge", () => {
    expect(trialOutcome({ events: [ev("halted", 3)], endsAt: ends, paidAfterStart: null, now: at(4) }).outcome).toBe("payment_failed");
  });

  it("uses a later paid purchase for trials from before the activated event existed", () => {
    expect(trialOutcome({ events: [], endsAt: ends, paidAfterStart: at(3), now: at(4) }).outcome).toBe("converted");
  });

  it("ends with nothing on record once the end date passes", () => {
    expect(trialOutcome({ events: [], endsAt: ends, paidAfterStart: null, now: at(5) }).outcome).toBe("ended");
  });
});

describe("summariseTrials", () => {
  it("counts conversion among finished trials only", () => {
    const s = summariseTrials([{ outcome: "active" }, { outcome: "converted" }, { outcome: "mandate_revoked" }, { outcome: "cancelled_in_app" }, { outcome: "converted" }]);
    expect(s.counts).toMatchObject({ active: 1, converted: 2, mandate_revoked: 1, cancelled_in_app: 1 });
    expect(s.conversionRate).toBe(0.5);
    expect(summariseTrials([{ outcome: "active" }]).conversionRate).toBeNull();
  });
});

describe("cancelReasonLabel", () => {
  it("reads the reasons the cancel paths write", () => {
    expect(cancelReasonLabel("admin_requested_trial")).toBe("by an admin");
    expect(cancelReasonLabel("plan_switch")).toBe("switched plan");
    expect(cancelReasonLabel(null)).toBeNull();
  });
});
