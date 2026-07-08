import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Regression guard for the Phase-0 fix to fulfillPayment: the RazorpayEvent
// idempotency claim and the actual credit/plan grant must commit atomically,
// so a crash mid-grant rolls back the claim too and a retry can safely
// re-attempt the full grant instead of silently no-op'ing forever.

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/email", () => ({
  sendPurchaseConfirmationEmail: vi.fn(async () => {}),
  sendAffiliateCommissionEmail: vi.fn(async () => {}),
}));

interface Db {
  razorpayEvents: Set<string>;
  users: Map<string, { credits: number; email: string; firstName: string | null; name: string | null }>;
  purchases: Map<string, unknown>;
  plans: Map<string, { id: string; slug: string; kind: string; credits: number; name: string; intervalMonths: number | null; monthlyCredits: number | null; veo3Included: boolean }>;
}

let db: Db;
let failNextUserUpdate = false;

function resetDb() {
  db = {
    razorpayEvents: new Set(),
    users: new Map([["user-1", { credits: 30, email: "a@test.com", firstName: "A", name: null }]]),
    purchases: new Map(),
    plans: new Map([
      ["pack_starter", { id: "plan-1", slug: "pack_starter", kind: "pack", credits: 60, name: "Starter", intervalMonths: null, monthlyCredits: null, veo3Included: false }],
    ]),
  };
  failNextUserUpdate = false;
}

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      $transaction: vi.fn(async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);

        const callback = arg as (tx: unknown) => Promise<unknown>;
        const staged = {
          events: new Set<string>(),
          userUpdates: [] as Array<{ userId: string; credits: number }>,
          purchases: [] as Array<{ id: string; userId: string; planId: string | null; amountInPaise: number; credits: number; status: string }>,
        };

        const tx = {
          razorpayEvent: {
            create: vi.fn(async ({ data }: { data: { id: string } }) => {
              if (db.razorpayEvents.has(data.id) || staged.events.has(data.id)) {
                throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
                  code: "P2002",
                  clientVersion: "0.0.0",
                });
              }
              staged.events.add(data.id);
            }),
          },
          plan: {
            findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => db.plans.get(where.slug) ?? null),
          },
          user: {
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: { credits?: { increment: number } } }) => {
              if (failNextUserUpdate) {
                failNextUserUpdate = false;
                throw new Error("simulated crash mid-transaction");
              }
              staged.userUpdates.push({ userId: where.id, credits: data.credits?.increment ?? 0 });
            }),
          },
          purchase: {
            create: vi.fn(async ({ data }: { data: { id: string; userId: string; planId: string | null; amountInPaise: number; credits: number; status: string } }) => {
              staged.purchases.push(data);
            }),
          },
        };

        // Only committed if the callback resolves without throwing — mirrors
        // real transaction rollback semantics.
        const result = await callback(tx);
        for (const id of staged.events) db.razorpayEvents.add(id);
        for (const u of staged.userUpdates) {
          const user = db.users.get(u.userId);
          if (user) user.credits += u.credits;
        }
        for (const p of staged.purchases) db.purchases.set(p.id, p);
        return result;
      }),
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const u = db.users.get(where.id);
          return u ? { ...u } : null;
        }),
      },
      plan: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => db.plans.get(where.slug) ?? null),
      },
      referral: {
        findUnique: vi.fn(async () => null),
      },
    },
  };
});

const { fulfillPayment } = await import("@/lib/fulfillment");

describe("fulfillPayment crash recovery", () => {
  beforeEach(resetDb);
  afterEach(() => vi.clearAllMocks());

  const args = {
    paymentId: "pay_123",
    orderId: "order_123",
    amountInPaise: 79900,
    notes: { userId: "user-1", planId: "pack_starter" },
  };

  it("rolls back the idempotency claim on a mid-transaction crash so a retry still grants credits", async () => {
    failNextUserUpdate = true;
    await expect(fulfillPayment(args)).rejects.toThrow("simulated crash mid-transaction");

    // The crash must not have left a dangling RazorpayEvent row — otherwise
    // the retry below would hit the P2002 "already processed" branch and
    // silently no-op, which is exactly the bug this test guards against.
    expect(db.razorpayEvents.has("pay_123")).toBe(false);
    expect(db.users.get("user-1")!.credits).toBe(30);

    const result = await fulfillPayment(args);
    expect(result).toEqual({ fulfilled: true, alreadyProcessed: false });
    expect(db.users.get("user-1")!.credits).toBe(90); // 30 + 60 credits from pack_starter
    expect(db.purchases.has("pay_123")).toBe(true);
  });

  it("no-ops on a genuine retry of an already-fulfilled payment", async () => {
    await fulfillPayment(args);
    expect(db.users.get("user-1")!.credits).toBe(90);

    const retry = await fulfillPayment(args);
    expect(retry).toEqual({ fulfilled: false, alreadyProcessed: true });
    expect(db.users.get("user-1")!.credits).toBe(90); // unchanged
  });
});
