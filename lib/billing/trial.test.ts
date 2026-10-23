import { beforeEach, describe, expect, it, vi } from "vitest";

// startTrialOnAuthentication's one-trial-per-card/UPI check. Everything around
// it (eligibility, Razorpay, grants, email) is stubbed; the identity rules
// themselves are in trial-instrument.test.ts.

const tx = {
  razorpayEvent: { create: vi.fn(async () => ({})) },
  user: { update: vi.fn(async () => ({})) },
  trialInstrument: { create: vi.fn(async () => ({})) },
};
const prisma = {
  plan: { findUnique: vi.fn(async () => ({ id: "plan-1", slug: "pro-monthly", name: "Pro", priceInPaise: 99900, monthlyCredits: 500, credits: 500, monthlyMinutes: 300 })) },
  user: { findUnique: vi.fn(async () => ({ razorpaySubscriptionId: null, trialUsedAt: null, email: "a@b.c", name: "A" })) },
  trialInstrument: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => null), upsert: vi.fn(async () => ({})) },
  subscriptionEvent: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/plans/tiers", () => ({ isTrialPlan: () => true, TRIAL_CREDITS: 100, TRIAL_DAYS: 7, TRIAL_MINUTES: 60 }));
vi.mock("./trial-eligibility", () => ({ trialEligibility: vi.fn(async () => null) }));
const cancel = vi.fn(async () => ({ ok: true }));
vi.mock("./subscription-switch", () => ({ cancelExistingSubscriptionForSwitch: cancel }));
vi.mock("@/lib/credits", () => ({ grantCredits: vi.fn(async () => ({})) }));
vi.mock("@/lib/minutes", () => ({ grantMinutes: vi.fn(async () => ({})) }));
vi.mock("@/lib/email", () => ({ sendTrialStartedEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/currency", () => ({ getPlanPriceMinor: vi.fn(async () => 1199) }));
vi.mock("./razorpay-client", () => ({ createRazorpay: () => ({}) }));
let fp: string | null = "fp-card-1";
const resolve = vi.fn(async () => fp);
vi.mock("./trial-instrument", () => ({ resolveTrialFingerprint: resolve }));

const { startTrialOnAuthentication } = await import("./trial");

const sub = { id: "sub_1", customer_id: "cust_1", start_at: Math.floor(Date.now() / 1000) + 7 * 86400, notes: { trial: "1", userId: "user-1", planId: "pro-monthly" } };

beforeEach(() => {
  vi.clearAllMocks();
  fp = "fp-card-1";
  prisma.trialInstrument.findFirst.mockResolvedValue(null);
});

describe("one trial per card or UPI ID", () => {
  it("starts the trial and records the instrument in the same transaction", async () => {
    expect(await startTrialOnAuthentication(sub, { paymentId: "pay_1" })).toEqual({ status: "started" });
    expect(resolve).toHaveBeenCalledWith(expect.anything(), sub, { paymentId: "pay_1" });
    expect(tx.trialInstrument.create).toHaveBeenCalledWith({ data: { fingerprint: "fp-card-1", userId: "user-1", subscriptionId: "sub_1" } });
  });

  it("refuses a card another account already used for a trial, and cancels the subscription", async () => {
    prisma.trialInstrument.findFirst.mockResolvedValue({ id: "ti-other" });
    expect(await startTrialOnAuthentication(sub)).toEqual({ status: "rejected", reason: "instrument-used" });
    expect(prisma.trialInstrument.findFirst).toHaveBeenCalledWith({
      where: { fingerprint: "fp-card-1", userId: { not: "user-1" } },
      select: { id: true },
    });
    expect(cancel).toHaveBeenCalledWith("user-1", "sub_1", "trial_ineligible");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("still starts the trial when the instrument can't be identified", async () => {
    fp = null;
    expect(await startTrialOnAuthentication(sub)).toEqual({ status: "started" });
    expect(prisma.trialInstrument.findFirst).not.toHaveBeenCalled();
    expect(tx.trialInstrument.create).not.toHaveBeenCalled();
  });

  it("records the instrument late when a redelivery can name it", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ razorpaySubscriptionId: "sub_1", trialUsedAt: new Date(), email: "a@b.c", name: "A" });
    expect(await startTrialOnAuthentication(sub, { paymentId: "pay_1" })).toEqual({ status: "already-started" });
    expect(prisma.trialInstrument.upsert).toHaveBeenCalledWith({
      where: { subscriptionId: "sub_1" },
      create: { fingerprint: "fp-card-1", userId: "user-1", subscriptionId: "sub_1" },
      update: {},
    });
  });
});
