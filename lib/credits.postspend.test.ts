import { beforeEach, describe, expect, it, vi } from "vitest";

// spendCredits() is the one function every credit-spending route in the app
// converges on (chargeCredits() calls it internally too), so it's the single
// choke point that must fire the first-video/low-credit email on a successful
// spend and the zero-credits email on a failed one. An audit found 6+ routes
// (AutoClip's confirm route among them) had never wired the old per-route
// call, so nobody who made their first video through those routes ever got
// the email. This pins the fix: the hook lives in spendCredits() itself, not
// in each caller.

interface Buckets { bonus: number; subscription: number; purchased: number }
let buckets: Buckets;
const firePostCreditSpendEmails = vi.fn();
const fireZeroCreditsEmail = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: true })) }));

vi.mock("@/lib/credit-events", () => ({ firePostCreditSpendEmails, fireZeroCreditsEmail }));

function drain(amount: number) {
  const ob = buckets.bonus, os = buckets.subscription, op = buckets.purchased;
  if (ob + os + op < amount) return [];
  buckets.bonus = ob - Math.min(ob, amount);
  buckets.subscription = os - Math.min(os, Math.max(amount - ob, 0));
  buckets.purchased = op - Math.max(amount - ob - os, 0);
  return [{ ob, os, op, nb: buckets.bonus, ns: buckets.subscription, np: buckets.purchased }];
}

vi.mock("@/lib/prisma", () => {
  const client = {
    user: {
      findUnique: vi.fn(async () => ({
        bonusCredits: buckets.bonus,
        subscriptionCredits: buckets.subscription,
        purchasedCredits: buckets.purchased,
        credits: buckets.bonus + buckets.subscription + buckets.purchased,
      })),
      update: vi.fn(async () => ({
        bonusCredits: buckets.bonus,
        subscriptionCredits: buckets.subscription,
        purchasedCredits: buckets.purchased,
      })),
    },
    creditTransaction: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      const amount = (args.slice(1).find((v) => typeof v === "number") as number) ?? 0;
      return drain(amount);
    }),
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(client)),
  };
  return { prisma: client };
});

const { spendCredits } = await import("./credits");

// spendCredits fires these hooks fire-and-forget; give the microtask queue a
// tick so the (mocked, near-instant) dynamic import + call resolves first.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  buckets = { bonus: 0, subscription: 0, purchased: 20 };
  vi.clearAllMocks();
});

describe("spendCredits — post-spend email hooks", () => {
  it("fires firePostCreditSpendEmails exactly once on a successful spend", async () => {
    const res = await spendCredits({ userId: "u1", amount: 5, reason: "spend:test" });
    expect(res.ok).toBe(true);
    await flush();
    expect(firePostCreditSpendEmails).toHaveBeenCalledTimes(1);
    expect(firePostCreditSpendEmails).toHaveBeenCalledWith("u1", 15);
    expect(fireZeroCreditsEmail).not.toHaveBeenCalled();
  });

  it("fires fireZeroCreditsEmail exactly once when the spend fails, and never the success hook", async () => {
    const res = await spendCredits({ userId: "u1", amount: 999, reason: "spend:test" });
    expect(res.ok).toBe(false);
    await flush();
    expect(fireZeroCreditsEmail).toHaveBeenCalledTimes(1);
    expect(fireZeroCreditsEmail).toHaveBeenCalledWith("u1");
    expect(firePostCreditSpendEmails).not.toHaveBeenCalled();
  });

  it("fires once per spend regardless of which route/reason triggered it — the whole point of centralizing in spendCredits()", async () => {
    await spendCredits({ userId: "u1", amount: 2, reason: "spend:auto-clip" });
    await flush();
    buckets.purchased += 2;
    await spendCredits({ userId: "u1", amount: 2, reason: "spend:auto-clip-rerender:failed" });
    await flush();
    expect(firePostCreditSpendEmails).toHaveBeenCalledTimes(2);
  });
});
