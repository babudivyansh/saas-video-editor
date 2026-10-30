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
  razorpayEvent: { create: vi.fn(async () => ({})) },
  // lockUserRow's SELECT ... FOR UPDATE, taken by every balance mutation that
  // reads then writes (clawbackCredits here) — and the audit writer's
  // advisory lock, which runs in its own transaction.
  $queryRaw: vi.fn(async () => []),
  // The audit writer appends inside a transaction (lib/admin/audit.ts).
  auditLog: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: { action: string } }) => {
      auditActions.push(data.action);
      return data;
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    user: { findUnique: vi.fn(async () => ({ credits: userCredits })) },
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
    expect(r).toEqual({ ok: true, creditsClawedBack: 300, minutesClawedBack: 0, partial: false, subscriptionEnded: false });
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
    expect(r).toEqual({ ok: true, creditsClawedBack: 0, minutesClawedBack: 0, partial: false, subscriptionEnded: false });
    expect(userCredits).toBe(300);
  });

  it("claws back a proportional share on a partial refund and keeps the purchase captured", async () => {
    userCredits = 500;
    const r = await refundPurchase({
      purchaseId: "pay_1", actorId: "system:razorpay-webhook", reason: "webhook", clawbackCredits: true,
      refund: { id: "rfnd_1", amountMinor: 24_975, totalRefundedMinor: 24_975 }, // a quarter of ₹999
    });
    expect(r).toMatchObject({ ok: true, creditsClawedBack: 125, partial: true });
    expect(purchase.status).toBe("captured");
    expect(userCredits).toBe(375);
    expect(auditActions).toContain("purchase.partially_refunded");
  });

  it("treats the refund that completes the total as full", async () => {
    const r = await refundPurchase({
      purchaseId: "pay_1", actorId: "system:razorpay-webhook", reason: "webhook", clawbackCredits: true,
      refund: { id: "rfnd_2", amountMinor: 74_925, totalRefundedMinor: 99_900 },
    });
    // Only this refund's three-quarter share (375 of the 500), floored at the 300 balance.
    expect(r).toMatchObject({ ok: true, partial: false, creditsClawedBack: 300 });
    expect(purchase.status).toBe("refunded");
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
