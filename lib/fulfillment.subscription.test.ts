import { beforeEach, describe, expect, it, vi } from "vitest";
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
        for (const k of ["subscriptionEndsAt", "monthlyCredits", "planId", "lowCreditEmailSentAt", "nextRefillAt", "trialEndsAt", "razorpaySubscriptionId"] as const) {
          if (k in data) (user as Record<string, unknown>)[k] = data[k];
        }
        return { ...user };
      }),
    },
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        // notes.planId slug resolves to the same 160-credit Pro plan.
        if (where.slug === "plan-pro-slug") return { id: "plan-pro", monthlyCredits: 160, credits: 160 };
        return null;
      }),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: (typeof ledger)[number] }) => { ledger.push(data); return data; }),
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
  renewalEmails = 0;
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
