import { beforeEach, describe, expect, it, vi } from "vitest";

interface PurchaseRow { id: string; userId: string; credits: number; amountInPaise: number; status: string }
let purchase: PurchaseRow;
let userCredits: number;
let auditActions: string[];

const tx = {
  purchase: {
    findUnique: vi.fn(async () => purchase),
    update: vi.fn(async ({ data }: { data: { status: string } }) => {
      purchase = { ...purchase, ...data };
      return purchase;
    }),
  },
  user: {
    // The whole balance is modeled as the purchased bucket — matches how
    // lib/credits getBalances/clawbackCredits/grantCredits read and write.
    findUnique: vi.fn(async () => ({
      credits: userCredits,
      bonusCredits: 0,
      subscriptionCredits: 0,
      purchasedCredits: userCredits,
    })),
    update: vi.fn(async ({ data }: { data: { credits?: { decrement?: number; increment?: number } } }) => {
      if (data.credits?.decrement) userCredits -= data.credits.decrement;
      if (data.credits?.increment) userCredits += data.credits.increment;
      return { credits: userCredits, bonusCredits: 0, subscriptionCredits: 0, purchasedCredits: userCredits };
    }),
  },
  creditTransaction: { create: vi.fn(async () => ({})) },
  // lockUserRow's SELECT ... FOR UPDATE, taken by every balance mutation that
  // reads then writes (clawbackCredits here).
  $queryRaw: vi.fn(async () => []),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    user: { findUnique: vi.fn(async () => ({ credits: userCredits })) },
    auditLog: {
      create: vi.fn(async ({ data }: { data: { action: string } }) => {
        auditActions.push(data.action);
        return data;
      }),
    },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { refundPurchase, adjustCredits } = await import("./billing");

beforeEach(() => {
  purchase = { id: "pay_1", userId: "u1", credits: 500, amountInPaise: 99_900, status: "captured" };
  userCredits = 300; // user already spent 200 of the granted 500
  auditActions = [];
  vi.clearAllMocks();
});

describe("refundPurchase", () => {
  it("marks refunded and claws back at most the current balance (never negative)", async () => {
    const r = await refundPurchase({ purchaseId: "pay_1", actorId: "admin-1", reason: "requested", clawbackCredits: true });
    expect(r).toEqual({ ok: true, creditsClawedBack: 300 });
    expect(purchase.status).toBe("refunded");
    expect(userCredits).toBe(0);
    expect(auditActions).toContain("purchase.refunded");
  });

  it("is idempotent: refunding twice returns 409 with no second clawback", async () => {
    await refundPurchase({ purchaseId: "pay_1", actorId: "admin-1", reason: "requested", clawbackCredits: true });
    const r2 = await refundPurchase({ purchaseId: "pay_1", actorId: "system:razorpay-webhook", reason: "webhook", clawbackCredits: true });
    expect(r2).toMatchObject({ ok: false, status: 409 });
    expect(userCredits).toBe(0);
  });

  it("can skip clawback when requested", async () => {
    const r = await refundPurchase({ purchaseId: "pay_1", actorId: "admin-1", reason: "goodwill", clawbackCredits: false });
    expect(r).toEqual({ ok: true, creditsClawedBack: 0 });
    expect(userCredits).toBe(300);
  });
});

describe("adjustCredits", () => {
  it("grants and returns the new balance", async () => {
    const r = await adjustCredits({ userId: "u1", delta: 100, actorId: "admin-1", reason: "support goodwill" });
    expect(r).toEqual({ ok: true, balance: 400 });
    expect(auditActions).toContain("credits.granted");
  });

  it("deductions floor at zero", async () => {
    const r = await adjustCredits({ userId: "u1", delta: -1000, actorId: "admin-1", reason: "correction" });
    expect(r).toEqual({ ok: true, balance: 0 });
    expect(auditActions).toContain("credits.deducted");
  });
});
