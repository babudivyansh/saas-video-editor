import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// fulfillSubscriptionCharge is the recurring counterpart to fulfillPayment's
// crash-recovery test: idempotent via the RazorpayEvent claim, and applies
// the 2x rollover cap on renewal instead of a flat increment.

vi.mock("@/lib/redis", () => ({
  redis: { set: vi.fn(async () => {}) },
}));

vi.mock("@/lib/email", () => ({
  sendPurchaseConfirmationEmail: vi.fn(async () => {}),
  sendAffiliateCommissionEmail: vi.fn(async () => {}),
  // Recurring renewals now send a receipt — previously they sent nothing.
  sendSubscriptionRenewedEmail: vi.fn(async () => { renewalEmails++; }),
}));
let renewalEmails = 0;
let referral: { id: string; affiliateId: string; status: string; affiliate: { userId: string; status: string; commissionRate: number } } | null = null;
let commissions: Array<{ amount: number }> = [];

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

interface UserRow {
  id: string;
  razorpaySubscriptionId: string;
  planId: string | null;
  monthlyCredits: number;
  bonusCredits: number;
  subscriptionCredits: number;
  purchasedCredits: number;
  subscriptionEndsAt: Date | null;
  nextRefillAt: Date | null;
  trialEndsAt: Date | null;
  lowCreditEmailSentAt: Date | null;
}
let user: UserRow;
let events: Set<string>;
let purchases: Map<string, unknown>;
let ledger: Array<{ userId: string; bucket: string; delta: number; reason: string; refId: string | null }>;
let minuteLedger: Array<{ userId: string; bucket: string; delta: number; reason: string; refId: string | null }>;

vi.mock("@/lib/prisma", () => {
  const client = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { razorpaySubscriptionId?: string; id?: string } }) => {
        if (where.razorpaySubscriptionId && where.razorpaySubscriptionId !== user.razorpaySubscriptionId) return null;
        if (where.id && where.id !== user.id) return null;
        return {
          id: user.id,
          planId: user.planId,
          monthlyCredits: user.monthlyCredits,
          razorpaySubscriptionId: user.razorpaySubscriptionId,
          trialEndsAt: user.trialEndsAt,
          bonusCredits: user.bonusCredits,
          subscriptionCredits: user.subscriptionCredits,
          purchasedCredits: user.purchasedCredits,
          // No plan yet models the pre-activation window (charged before
          // activated wrote planId/monthlyCredits).
          plan: user.planId ? { id: user.planId, monthlyCredits: user.monthlyCredits, credits: user.monthlyCredits } : null,
        };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        for (const k of ["bonusCredits", "subscriptionCredits", "purchasedCredits"] as const) {
          const d = data[k];
          if (d && typeof d === "object") {
            const op = d as { increment?: number };
            if (op.increment) user[k] += op.increment;
          }
        }
        for (const k of ["subscriptionEndsAt", "monthlyCredits", "planId", "lowCreditEmailSentAt", "nextRefillAt", "trialEndsAt", "razorpaySubscriptionId", "subscriptionCurrency"] as const) {
          if (k in data) (user as Record<string, unknown>)[k] = data[k];
        }
        return { ...user };
      }),
    },
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        // notes.planId slug resolves to the same 160-credit Pro plan.
        if (where.slug === "plan-pro-slug") return { id: "plan-pro", monthlyCredits: 160, credits: 160 };
        if (where.slug === "plan-pro-monthly") return { id: "plan-pro", monthlyCredits: 160, credits: 160, intervalMonths: 1, monthlyMinutes: 400 };
        if (where.slug === "plan-pro-annual") return { id: "plan-pro-yr", monthlyCredits: 160, credits: 1920, intervalMonths: 12, monthlyMinutes: 400 };
        return null;
      }),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: (typeof ledger)[number] }) => { ledger.push(data); return data; }),
      findFirst: vi.fn(async ({ where }: { where: { userId: string; reason: string } }) =>
        ledger.find((r) => r.userId === where.userId && r.reason === where.reason) ?? null),
    },
    minuteTransaction: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; reason: string; refId?: string } }) =>
        minuteLedger.find((r) => r.userId === where.userId && r.reason === where.reason && (where.refId === undefined || r.refId === where.refId)) ?? null),
      create: vi.fn(async ({ data }: { data: (typeof minuteLedger)[number] }) => { minuteLedger.push(data); return data; }),
    },
    razorpayEvent: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (events.has(data.id)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "0.0.0" });
        }
        events.add(data.id);
      }),
    },
    purchase: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => { purchases.set(data.id, data); }),
    },
    subscriptionEvent: { create: vi.fn(async () => ({})) },
    // Affiliate commission on subscription charges (processReferralPayment).
    referral: {
      findUnique: vi.fn(async () => referral),
      updateMany: vi.fn(async ({ where }: { where: { status?: string } }) => {
        if (!referral || (where.status && referral.status !== where.status)) return { count: 0 };
        referral.status = "converted";
        return { count: 1 };
      }),
    },
    commission: { create: vi.fn(async ({ data }: { data: { amount: number } }) => { commissions.push(data); return data; }) },
    affiliate: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ totalEarned: 0 })) },
    config: { findUnique: vi.fn(async () => null) },
    // lib/minutes locks the user row before a monthly grant.
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(client)),
  };
  return { prisma: client };
});

const { fulfillSubscriptionCharge } = await import("./fulfillment");

beforeEach(() => {
  user = {
    id: "u1",
    razorpaySubscriptionId: "sub_1",
    planId: "plan-pro",
    monthlyCredits: 160,
    bonusCredits: 0,
    subscriptionCredits: 0,
    purchasedCredits: 0,
    subscriptionEndsAt: null,
    nextRefillAt: null,
    trialEndsAt: new Date(),
    lowCreditEmailSentAt: new Date(),
  };
  events = new Set();
  purchases = new Map();
  ledger = [];
  minuteLedger = [];
  renewalEmails = 0;
  referral = null;
  commissions = [];
  vi.clearAllMocks();
});

describe("fulfillSubscriptionCharge", () => {
  it("grants the monthly credits, extends the term, clears trial state", async () => {
    const res = await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_1", amountInPaise: 219900 });
    expect(res).toEqual({ fulfilled: true, alreadyProcessed: false });
    expect(user.subscriptionCredits).toBe(160);
    expect(user.subscriptionEndsAt).not.toBeNull();
    expect(user.nextRefillAt).toBeNull(); // never cron-refills
    expect(purchases.has("pay_1")).toBe(true);
    expect(ledger).toEqual([expect.objectContaining({ bucket: "subscription", delta: 160, refId: "pay_1" })]);
    // Recurring subscribers used to be the only customers charged every month
    // and the only ones never emailed about it.
    expect(renewalEmails).toBe(1);
  });

  it("is idempotent on webhook redelivery", async () => {
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_1", amountInPaise: 219900 });
    const retry = await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_1", amountInPaise: 219900 });
    expect(retry).toEqual({ fulfilled: false, alreadyProcessed: true });
    expect(user.subscriptionCredits).toBe(160); // not double-granted
  });

  it("caps the renewal grant at 2x monthly credits (rollover)", async () => {
    user.subscriptionCredits = 250; // heavy unused balance from a light month
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_1", amountInPaise: 219900 });
    // min(250+160, 320) = 320 -> only 70 applied.
    expect(user.subscriptionCredits).toBe(320);
    expect(ledger).toEqual([expect.objectContaining({ delta: 70 })]);
  });

  it("no-ops for an unknown subscription when there is no owner to recover from", async () => {
    const res = await fulfillSubscriptionCharge({ subscriptionId: "sub_unknown", paymentId: "pay_2", amountInPaise: 219900 });
    expect(res).toEqual({ fulfilled: false, alreadyProcessed: false });
  });

  // Regression: this case used to be a silent no-op — the customer was charged
  // and got nothing, permanently, because the refill cron had nulled
  // razorpaySubscriptionId while a renewal was still being retried. The
  // subscription's notes.userId identifies the real owner, so recover from it.
  it("re-links and fulfils when the local subscription link was lost", async () => {
    user.razorpaySubscriptionId = null as unknown as string; // cron wiped it
    const res = await fulfillSubscriptionCharge({
      subscriptionId: "sub_1",
      paymentId: "pay_recover",
      amountInPaise: 219900,
      notesUserId: "u1",
    });
    expect(res).toEqual({ fulfilled: true, alreadyProcessed: false });
    expect(user.razorpaySubscriptionId).toBe("sub_1");
    expect(user.subscriptionCredits).toBe(160);
    expect(purchases.has("pay_recover")).toBe(true);
  });

  // Regression: if subscription.charged is delivered before
  // subscription.activated, the user row has no plan yet, so the grant used to
  // resolve to 0 credits — the customer paid for nothing that first month.
  // notes.planId identifies the plan, so resolve the grant (and the plan link)
  // from it.
  it("resolves the plan from notes.planId when charged arrives before activated", async () => {
    user.planId = null; // activated hasn't written it yet
    user.monthlyCredits = 0;
    const res = await fulfillSubscriptionCharge({
      subscriptionId: "sub_1",
      paymentId: "pay_early",
      amountInPaise: 219900,
      notesPlanId: "plan-pro-slug",
    });
    expect(res).toEqual({ fulfilled: true, alreadyProcessed: false });
    expect(user.subscriptionCredits).toBe(160); // not 0
    expect(user.planId).toBe("plan-pro"); // plan link persisted for tier gating
    expect(purchases.get("pay_early")).toMatchObject({ planId: "plan-pro", credits: 160 });
  });

  it("never steals a subscription from a user already on a different one", async () => {
    user.razorpaySubscriptionId = "sub_other";
    const res = await fulfillSubscriptionCharge({
      subscriptionId: "sub_1",
      paymentId: "pay_3",
      amountInPaise: 219900,
      notesUserId: "u1",
    });
    expect(res).toEqual({ fulfilled: false, alreadyProcessed: false });
    expect(user.razorpaySubscriptionId).toBe("sub_other");
    expect(user.subscriptionCredits).toBe(0);
  });
});

// Annual plans are Razorpay `yearly` plans — charged once a year. The charge
// used to extend access by one month and switch refills off, so an annual
// subscriber lost access ~33 days into a paid year.
describe("fulfillSubscriptionCharge — term length", () => {
  const MONTH_MS = 30 * 86_400_000;
  const monthsFromNow = (d: Date | null) => (d ? (d.getTime() - Date.now()) / MONTH_MS : NaN);

  it("gives an annual charge the whole year, first month's credits now, month 2 via the refill cron", async () => {
    await fulfillSubscriptionCharge({
      subscriptionId: "sub_1", paymentId: "pay_yr", amountInPaise: 1768000, notesPlanId: "plan-pro-annual",
    });
    expect(user.subscriptionCredits).toBe(160); // one month, not the year's 1,920
    expect(monthsFromNow(user.subscriptionEndsAt)).toBeGreaterThan(12);
    expect(monthsFromNow(user.subscriptionEndsAt)).toBeLessThan(12.5);
    expect(monthsFromNow(user.nextRefillAt)).toBeGreaterThan(0.9);
    expect(monthsFromNow(user.nextRefillAt)).toBeLessThan(1.1);
    expect(user.planId).toBe("plan-pro"); // existing link kept; activated owns plan switches
  });

  it("gives a monthly charge one month and leaves refills to the next charge", async () => {
    await fulfillSubscriptionCharge({
      subscriptionId: "sub_1", paymentId: "pay_mo", amountInPaise: 219900, notesPlanId: "plan-pro-monthly",
    });
    expect(monthsFromNow(user.subscriptionEndsAt)).toBeLessThan(1.3);
    expect(user.nextRefillAt).toBeNull();
  });

  it("uses the subscription's own plan, not a stale one on the user row", async () => {
    // The row still holds the monthly plan being switched away from.
    await fulfillSubscriptionCharge({
      subscriptionId: "sub_1", paymentId: "pay_switch", amountInPaise: 1768000, notesPlanId: "plan-pro-annual",
    });
    expect(monthsFromNow(user.subscriptionEndsAt)).toBeGreaterThan(12);
  });
});

// Each charge records the currency it was taken in, so billing quotes the
// next one correctly (an INR subscriber on an en-US browser saw "$29").
describe("fulfillSubscriptionCharge — currency", () => {
  it("stores the charge's currency on the subscriber", async () => {
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_usd", amountInPaise: 2900, currency: "usd" });
    expect((user as unknown as { subscriptionCurrency?: string }).subscriptionCurrency).toBe("USD");
  });

  it("leaves it alone when Razorpay gave no currency", async () => {
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_none", amountInPaise: 219900 });
    expect((user as unknown as { subscriptionCurrency?: string }).subscriptionCurrency).toBeUndefined();
  });
});

describe("fulfillSubscriptionCharge — Diwali 2026 monthly bonus", () => {
  const monthly = { subscriptionId: "sub_1", amountInPaise: 219900, notesPlanId: "plan-pro-monthly", notesDiwaliBonus: "monthly" };

  it("adds 50% of the monthly credits to the bonus bucket on the first charge", async () => {
    await fulfillSubscriptionCharge({ ...monthly, paymentId: "pay_1" });
    expect(user.subscriptionCredits).toBe(160);
    expect(user.bonusCredits).toBe(80);
    expect(ledger).toContainEqual(expect.objectContaining({ bucket: "bonus", delta: 80, reason: "grant:diwali-monthly-bonus", refId: "pay_1" }));
  });

  it("grants it once per account — a renewal gets none", async () => {
    await fulfillSubscriptionCharge({ ...monthly, paymentId: "pay_1" });
    await fulfillSubscriptionCharge({ ...monthly, paymentId: "pay_2" });
    expect(ledger.filter((r) => r.reason === "grant:diwali-monthly-bonus")).toHaveLength(1);
    expect(user.bonusCredits).toBe(80);
  });

  it("gives a yearly plan none, even if the note were present", async () => {
    await fulfillSubscriptionCharge({ ...monthly, notesPlanId: "plan-pro-annual", paymentId: "pay_1" });
    expect(user.bonusCredits).toBe(0);
  });

  it("gives nothing without the checkout note (bought outside the window)", async () => {
    await fulfillSubscriptionCharge({ ...monthly, notesDiwaliBonus: undefined, paymentId: "pay_1" });
    expect(user.bonusCredits).toBe(0);
    expect(ledger.some((r) => r.reason === "grant:diwali-monthly-bonus")).toBe(false);
  });
});

describe("fulfillSubscriptionCharge — Black Friday 2026 first-month bonus", () => {
  const IN_WINDOW = new Date("2026-11-27T12:00:00+05:30");
  const AFTER_WINDOW = new Date("2026-12-03T12:00:00+05:30");
  const BEFORE_WINDOW = new Date("2026-11-20T12:00:00+05:30");
  const yearly = { subscriptionId: "sub_1", amountInPaise: 2_000_000, notesPlanId: "plan-pro-annual", notesBf26: "plan" };
  const bfRows = () => minuteLedger.filter((r) => r.reason === "grant:bf26-plan-bonus");

  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(IN_WINDOW); user.trialEndsAt = null; });
  afterEach(() => vi.useRealTimers());

  it("adds one month of Clip Minutes (not credits) to a yearly plan's first charge", async () => {
    await fulfillSubscriptionCharge({ ...yearly, paymentId: "pay_1" });
    expect(bfRows()).toEqual([expect.objectContaining({ bucket: "bonus", delta: 400, refId: "pay_1" })]);
    expect(ledger.some((r) => r.reason.startsWith("grant:bf26"))).toBe(false);
    expect(purchases.get("pay_1")).toMatchObject({ minutes: 800 });
  });

  it("works for monthly plans too", async () => {
    await fulfillSubscriptionCharge({ ...yearly, notesPlanId: "plan-pro-monthly", paymentId: "pay_1" });
    expect(bfRows()).toHaveLength(1);
    expect(bfRows()[0].delta).toBe(400);
  });

  it("is once per account: a redelivery, a renewal or a second subscription get nothing", async () => {
    await fulfillSubscriptionCharge({ ...yearly, paymentId: "pay_1" });
    await fulfillSubscriptionCharge({ ...yearly, paymentId: "pay_1" });
    await fulfillSubscriptionCharge({ ...yearly, paymentId: "pay_2" });
    expect(bfRows()).toHaveLength(1);
  });

  it("honours the checkout stamp when the first charge lands after 30 Nov (trial bought in the window)", async () => {
    vi.setSystemTime(AFTER_WINDOW);
    user.trialEndsAt = new Date(AFTER_WINDOW);
    await fulfillSubscriptionCharge({ ...yearly, notesPlanId: "plan-pro-monthly", paymentId: "pay_1" });
    expect(bfRows()).toHaveLength(1);
  });

  it("gives a pre-window trial the bonus when it converts inside the window", async () => {
    user.trialEndsAt = new Date(IN_WINDOW);
    await fulfillSubscriptionCharge({ ...yearly, notesPlanId: "plan-pro-monthly", notesBf26: undefined, paymentId: "pay_1" });
    expect(bfRows()).toHaveLength(1);
  });

  it("gives an unstamped trial converting outside the window nothing", async () => {
    vi.setSystemTime(BEFORE_WINDOW);
    user.trialEndsAt = new Date(BEFORE_WINDOW);
    await fulfillSubscriptionCharge({ ...yearly, notesPlanId: "plan-pro-monthly", notesBf26: undefined, paymentId: "pay_1" });
    expect(bfRows()).toHaveLength(0);
  });

  it("gives an unstamped renewal of an existing plan nothing, even in the window", async () => {
    await fulfillSubscriptionCharge({ ...yearly, notesBf26: undefined, paymentId: "pay_1" });
    expect(bfRows()).toHaveLength(0);
  });
});

describe("fulfillSubscriptionCharge — affiliate commission", () => {
  it("pays the referring affiliate on a referred subscriber's first charge, once", async () => {
    referral = { id: "ref-1", affiliateId: "aff-1", status: "signed_up", affiliate: { userId: "aff-user", status: "active", commissionRate: 0.2 } };
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_c1", amountInPaise: 99900, currency: "INR" });
    expect(commissions).toEqual([expect.objectContaining({ amount: 199.8, baseAmount: 999, commissionRate: 0.2, referralId: "ref-1" })]);
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_c2", amountInPaise: 99900, currency: "INR" });
    expect(commissions).toHaveLength(1);
  });

  it("pays nothing without a referral", async () => {
    await fulfillSubscriptionCharge({ subscriptionId: "sub_1", paymentId: "pay_c3", amountInPaise: 99900, currency: "INR" });
    expect(commissions).toHaveLength(0);
  });
});
