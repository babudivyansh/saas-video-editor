import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercises spendCredits' post-spend auto-topup hook (maybeAutoTopup):
// threshold trigger, opt-in gating, debounce lock, and the email send.

interface Buckets { bonus: number; subscription: number; purchased: number }
let buckets: Buckets;
let user: { autoTopupPackSlug: string | null; autoTopupThreshold: number; email: string; firstName: string | null; name: string | null };
let pack: { slug: string; name: string; active: boolean; kind: string } | null;
let redisStore: Record<string, string>;
const sendAutoTopupPromptEmail = vi.fn(async () => {});

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => redisStore[key] ?? null),
    set: vi.fn(async (key: string, value: string) => { redisStore[key] = value; }),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: true })) }));

vi.mock("@/lib/email", () => ({ sendAutoTopupPromptEmail }));

// spendCredits also fires the first-video/low-credit/zero-credit hooks via a
// dynamic import of lib/credit-events — mocked out here so this file stays
// scoped to auto-topup. Covered on its own in credits.postspend.test.ts.
vi.mock("@/lib/credit-events", () => ({
  firePostCreditSpendEmails: vi.fn(),
  fireZeroCreditsEmail: vi.fn(),
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
  const client = {
    user: {
      // spendCredits' own findUnique (insufficient path) is unused here since
      // every spend in this test succeeds; maybeAutoTopup's findUnique is the
      // one under test.
      findUnique: vi.fn(async () => ({ ...user })),
    },
    plan: {
      findUnique: vi.fn(async () => pack),
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

beforeEach(() => {
  buckets = { bonus: 0, subscription: 0, purchased: 20 };
  user = { autoTopupPackSlug: "pack_mini", autoTopupThreshold: 10, email: "u@test.co", firstName: "A", name: null };
  pack = { slug: "pack_mini", name: "Mini Pack", active: true, kind: "pack" };
  redisStore = {};
  vi.clearAllMocks();
});

// spendCredits fires maybeAutoTopup fire-and-forget; give the microtask queue
// a tick so the (mocked, near-instant) async chain resolves before asserting.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("auto top-up (post-spend hook)", () => {
  it("sends the prompt email when a spend drops the balance below the threshold", async () => {
    const res = await spendCredits({ userId: "u1", amount: 15, reason: "spend:test" }); // 20 -> 5
    expect(res.ok).toBe(true);
    await flush();
    expect(sendAutoTopupPromptEmail).toHaveBeenCalledTimes(1);
    expect(sendAutoTopupPromptEmail).toHaveBeenCalledWith("u@test.co", "A", 5, "Mini Pack", expect.stringContaining("pack_mini"));
  });

  it("does nothing when the balance stays at or above the threshold", async () => {
    await spendCredits({ userId: "u1", amount: 5, reason: "spend:test" }); // 20 -> 15
    await flush();
    expect(sendAutoTopupPromptEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the user hasn't opted in", async () => {
    user.autoTopupPackSlug = null;
    await spendCredits({ userId: "u1", amount: 15, reason: "spend:test" });
    await flush();
    expect(sendAutoTopupPromptEmail).not.toHaveBeenCalled();
  });

  it("debounces: a second low-balance spend within the lock window doesn't re-send", async () => {
    await spendCredits({ userId: "u1", amount: 15, reason: "spend:test" }); // 20 -> 5
    await flush();
    buckets.purchased = 20; // simulate a grant back above threshold then spent down again
    await spendCredits({ userId: "u1", amount: 15, reason: "spend:test" }); // 20 -> 5 again
    await flush();
    expect(sendAutoTopupPromptEmail).toHaveBeenCalledTimes(1);
  });

  // Per-user configurable threshold (account-settings remediation) — this
  // used to be one hardcoded global constant, so the same balance had to
  // trigger the same way for every account regardless of their own setting.
  it("uses the user's own threshold rather than the old global default of 10", async () => {
    user.autoTopupThreshold = 25;
    await spendCredits({ userId: "u1", amount: 5, reason: "spend:test" }); // 20 -> 15, below their 25
    await flush();
    expect(sendAutoTopupPromptEmail).toHaveBeenCalledTimes(1);
  });

  it("does not fire above a raised per-user threshold even though it's below the old global default", async () => {
    user.autoTopupThreshold = 5;
    await spendCredits({ userId: "u1", amount: 5, reason: "spend:test" }); // 20 -> 15, above their 5
    await flush();
    expect(sendAutoTopupPromptEmail).not.toHaveBeenCalled();
  });
});
