import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory model of the three bucket columns + ledger, exercising
// spendCredits' drain order, restoreSpend's per-bucket reversal, and
// clawbackCredits' floor-at-zero semantics.

interface Buckets { bonus: number; subscription: number; purchased: number }
let buckets: Buckets;
let ledger: Array<{ userId: string; bucket: string; delta: number; reason: string; refId: string | null }>;
let redisSets: Array<{ key: string; value: string }>;

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async (key: string, value: string) => { redisSets.push({ key, value }); }),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/tool-config", () => ({
  getToolConfig: vi.fn(async () => ({ enabled: true })),
}));

function drain(amount: number) {
  const ob = buckets.bonus, os = buckets.subscription, op = buckets.purchased;
  if (ob + os + op < amount) return [];
  buckets.bonus = ob - Math.min(ob, amount);
  buckets.subscription = os - Math.min(os, Math.max(amount - ob, 0));
  buckets.purchased = op - Math.max(amount - ob - os, 0);
  return [{ ob, os, op, nb: buckets.bonus, ns: buckets.subscription, np: buckets.purchased }];
}

vi.mock("@/lib/prisma", () => {
  const user = {
    findUnique: vi.fn(async () => ({
      bonusCredits: buckets.bonus,
      subscriptionCredits: buckets.subscription,
      purchasedCredits: buckets.purchased,
      credits: buckets.bonus + buckets.subscription + buckets.purchased,
    })),
    update: vi.fn(async ({ data }: { data: Record<string, { increment?: number; decrement?: number } | number> }) => {
      for (const [col, key] of [
        ["bonusCredits", "bonus"],
        ["subscriptionCredits", "subscription"],
        ["purchasedCredits", "purchased"],
      ] as const) {
        const d = data[col];
        if (d && typeof d === "object") {
          if (d.increment) buckets[key] += d.increment;
          if (d.decrement) buckets[key] -= d.decrement;
        } else if (typeof d === "number") {
          buckets[key] = d;
        }
      }
      return {
        bonusCredits: buckets.bonus,
        subscriptionCredits: buckets.subscription,
        purchasedCredits: buckets.purchased,
      };
    }),
  };
  const client = {
    user,
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: (typeof ledger)[number] }) => { ledger.push(data); return data; }),
      findMany: vi.fn(async ({ where }: { where: { refId: string } }) =>
        ledger.filter((l) => l.refId === where.refId)),
    },
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      const amount = (args.slice(1).find((v) => typeof v === "number") as number) ?? 0;
      return drain(amount);
    }),
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(client)),
  };
  return { prisma: client };
});

const { spendCredits, restoreSpend, grantCredits, clawbackCredits, setSubscriptionCredits, getBalances } =
  await import("./credits");

beforeEach(() => {
  buckets = { bonus: 5, subscription: 10, purchased: 20 };
  ledger = [];
  redisSets = [];
  vi.clearAllMocks();
});

describe("spendCredits", () => {
  it("drains bonus -> subscription -> purchased in order", async () => {
    const res = await spendCredits({ userId: "u1", amount: 12, reason: "spend:test", refId: "gen-1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.breakdown).toEqual({ bonus: 5, subscription: 7 });
    expect(res.balances).toEqual({ bonus: 0, subscription: 3, purchased: 20, total: 23 });
    // Ledger: one negative row per drained bucket, tied to the refId.
    expect(ledger).toEqual([
      expect.objectContaining({ bucket: "bonus", delta: -5, refId: "gen-1" }),
      expect.objectContaining({ bucket: "subscription", delta: -7, refId: "gen-1" }),
    ]);
    // Cache refreshed with the new total.
    expect(redisSets.at(-1)).toMatchObject({ key: "credits:u1", value: "23" });
  });

  it("fails atomically with no side effects when total is insufficient", async () => {
    const res = await spendCredits({ userId: "u1", amount: 99, reason: "spend:test" });
    expect(res.ok).toBe(false);
    expect(buckets).toEqual({ bonus: 5, subscription: 10, purchased: 20 });
    expect(ledger).toHaveLength(0);
  });
});

describe("restoreSpend", () => {
  it("restores exactly the buckets a spend drained", async () => {
    await spendCredits({ userId: "u1", amount: 12, reason: "spend:test", refId: "gen-1" });
    const restored = await restoreSpend({ userId: "u1", refId: "gen-1" });
    expect(restored).toBe(12);
    expect(buckets).toEqual({ bonus: 5, subscription: 10, purchased: 20 });
  });

  it("supports partial refunds and never over-refunds on repeat calls", async () => {
    await spendCredits({ userId: "u1", amount: 12, reason: "spend:test", refId: "gen-1" });
    const first = await restoreSpend({ userId: "u1", refId: "gen-1", amount: 4 });
    expect(first).toBe(4);
    const second = await restoreSpend({ userId: "u1", refId: "gen-1" }); // rest
    expect(second).toBe(8);
    const third = await restoreSpend({ userId: "u1", refId: "gen-1" }); // nothing left
    expect(third).toBe(0);
    expect(buckets).toEqual({ bonus: 5, subscription: 10, purchased: 20 });
  });
});

describe("grantCredits", () => {
  it("grants into the requested bucket and writes a ledger row", async () => {
    await grantCredits({ userId: "u1", bucket: "subscription", amount: 40, reason: "grant:refill" });
    expect(buckets.subscription).toBe(50);
    expect(ledger).toEqual([expect.objectContaining({ bucket: "subscription", delta: 40, reason: "grant:refill" })]);
  });
});

describe("clawbackCredits", () => {
  it("drains purchased first and floors at zero instead of failing", async () => {
    const clawed = await clawbackCredits({ userId: "u1", amount: 100, reason: "clawback:refund" });
    expect(clawed).toBe(35);
    expect(buckets).toEqual({ bonus: 0, subscription: 0, purchased: 0 });
  });
});

describe("setSubscriptionCredits", () => {
  it("hard-sets the bucket and records the delta", async () => {
    await setSubscriptionCredits("u1", 0, "lapse");
    expect(buckets.subscription).toBe(0);
    expect(ledger).toEqual([expect.objectContaining({ bucket: "subscription", delta: -10, reason: "lapse" })]);
    const bal = await getBalances("u1");
    expect(bal.total).toBe(25);
  });
});
