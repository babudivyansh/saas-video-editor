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
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

interface UserRow {
  id: string;
  razorpaySubscriptionId: string;
  planId: string;
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
        return {
          id: user.id,
          planId: user.planId,
          monthlyCredits: user.monthlyCredits,
          bonusCredits: user.bonusCredits,
          subscriptionCredits: user.subscriptionCredits,
          purchasedCredits: user.purchasedCredits,
          plan: { id: user.planId, monthlyCredits: user.monthlyCredits, credits: user.monthlyCredits },
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
        for (const k of ["subscriptionEndsAt", "monthlyCredits", "lowCreditEmailSentAt", "nextRefillAt", "trialEndsAt"] as const) {
          if (k in data) (user as Record<string, unknown>)[k] = data[k];
        }
        return { ...user };
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

  it("no-ops for an unknown subscription id", async () => {
    const res = await fulfillSubscriptionCharge({ subscriptionId: "sub_unknown", paymentId: "pay_2", amountInPaise: 219900 });
    expect(res).toEqual({ fulfilled: false, alreadyProcessed: false });
  });
});
