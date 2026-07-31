import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "test-secret", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" },
}));

// Records every subscription the cron asks Razorpay to cancel, so the lapse
// tests can assert we stop the mandate before dropping the local link.
const cancelledSubs: string[] = [];
let cancelShouldFail = false;
vi.mock("razorpay", () => ({
  default: class {
    subscriptions = {
      cancel: vi.fn(async (id: string) => {
        if (cancelShouldFail) throw new Error("network down");
        cancelledSubs.push(id);
        return { id, status: "cancelled" };
      }),
    };
  },
}));
vi.mock("@/lib/email", () => ({ sendCreditsRefilledEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn(async () => {}) } }));

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  name: string | null;
  credits: number;
  bonusCredits: number;
  subscriptionCredits: number;
  purchasedCredits: number;
  bonusCreditsExpireAt: Date | null;
  freeCreditsRefillAt: Date | null;
  monthlyCredits: number;
  subscriptionEndsAt: Date | null;
  nextRefillAt: Date | null;
  planId: string | null;
  subscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  subscriptionCancelledAt: Date | null;
  lowCreditEmailSentAt: Date | null;
}
let users: UserRow[];

const BUCKETS = ["bonusCredits", "subscriptionCredits", "purchasedCredits"] as const;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // lib/credits helpers run inside a transaction and write ledger rows.
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)(
        (await import("@/lib/prisma")).prisma,
      );
    }),
    // lockUserRow's advisory SELECT ... FOR UPDATE.
    $queryRaw: vi.fn(async () => []),
    creditTransaction: { create: vi.fn(async () => ({})) },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const now = new Date();
        if ("nextRefillAt" in where) {
          return users.filter((u) => u.nextRefillAt !== null && u.nextRefillAt <= now && u.razorpaySubscriptionId === null);
        }
        if ("bonusCreditsExpireAt" in where) {
          return users.filter((u) => u.bonusCreditsExpireAt !== null && u.bonusCreditsExpireAt <= now && u.bonusCredits > 0);
        }
        if ("freeCreditsRefillAt" in where) {
          return users.filter((u) => u.planId === null && u.freeCreditsRefillAt !== null && u.freeCreditsRefillAt <= now);
        }
        // The lapse step now runs two queries: prepaid subs lapse at term end,
        // recurring ones only after an extra grace window.
        const ends = where.subscriptionEndsAt as { lte: Date };
        const cutoff = ends.lte;
        const wantsRecurring = typeof where.razorpaySubscriptionId === "object" && where.razorpaySubscriptionId !== null;
        return users.filter((u) =>
          u.subscriptionEndsAt !== null &&
          u.subscriptionEndsAt <= cutoff &&
          (wantsRecurring ? u.razorpaySubscriptionId !== null : u.razorpaySubscriptionId === null));
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = users.find((x) => x.id === where.id);
        return u ? { ...u } : null;
      }),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const u = users.find((x) => x.id === where.id)! as Record<string, unknown> & UserRow;
        for (const k of ["credits", ...BUCKETS] as const) {
          const d = data[k];
          if (d && typeof d === "object") {
            const op = d as { increment?: number; decrement?: number };
            if (op.increment) u[k] += op.increment;
            if (op.decrement) u[k] -= op.decrement;
          } else if (typeof d === "number") {
            const delta = (d as number) - u[k];
            u[k] = d as number;
            // Column-set on a bucket comes with a matching credits delta from
            // setSubscriptionCredits — no extra handling needed here.
            void delta;
          }
        }
        for (const k of ["planId", "subscriptionId", "razorpaySubscriptionId", "subscriptionCancelledAt", "subscriptionEndsAt", "nextRefillAt", "monthlyCredits", "lowCreditEmailSentAt", "bonusCreditsExpireAt", "freeCreditsRefillAt"] as const) {
          if (k in data) (u as Record<string, unknown>)[k] = data[k];
        }
        return { ...u };
      }),
    },
  },
}));

const { GET } = await import("./route");

const run = () =>
  GET(new NextRequest("http://localhost/api/cron/refill-credits", {
    headers: { authorization: "Bearer test-secret" },
  }));

const DAY = 86400_000;

beforeEach(() => {
  users = [];
  cancelledSubs.length = 0;
  cancelShouldFail = false;
  vi.clearAllMocks();
});

function user(overrides: Partial<UserRow>): UserRow {
  const u: UserRow = {
    id: `u${users.length + 1}`,
    email: "u@test.co",
    firstName: null,
    name: null,
    credits: 0,
    bonusCredits: 0,
    subscriptionCredits: 0,
    purchasedCredits: 0,
    bonusCreditsExpireAt: null,
    freeCreditsRefillAt: null,
    monthlyCredits: 140,
    subscriptionEndsAt: new Date(Date.now() + 300 * DAY),
    nextRefillAt: null,
    planId: "plan-1",
    subscriptionId: "order-1",
    razorpaySubscriptionId: null,
    subscriptionCancelledAt: null,
    lowCreditEmailSentAt: null,
    ...overrides,
  };
  // Keep the denormalized total consistent with the buckets.
  u.credits = u.bonusCredits + u.subscriptionCredits + u.purchasedCredits;
  users.push(u);
  return u;
}

describe("cron refill", () => {
  it("rejects a missing/wrong secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/refill-credits"));
    expect(res.status).toBe(401);
  });

  it("grants a due refill and advances nextRefillAt by a month", async () => {
    const u = user({ nextRefillAt: new Date(Date.now() - DAY) });
    const res = await run();
    expect(res.status).toBe(200);
    expect(u.credits).toBe(140);
    expect(u.nextRefillAt!.getTime()).toBeGreaterThan(Date.now());
    expect(u.lowCreditEmailSentAt).toBeNull();
  });

  it("does not refill when nothing is due", async () => {
    const u = user({ nextRefillAt: new Date(Date.now() + 5 * DAY) });
    await run();
    expect(u.credits).toBe(0);
  });

  it("still processes a due refill on a late cron run, then lapse zeroes it (policy)", async () => {
    // Refill was due 3 days ago; term ended yesterday; cron only fires now.
    // The refill is granted (refill step runs before expiry) but under the
    // rollover policy subscription credits end with the term, so the lapse
    // step zeroes the subscription bucket in the same run. Purchased credits
    // would survive.
    const u = user({
      purchasedCredits: 20,
      nextRefillAt: new Date(Date.now() - 3 * DAY),
      subscriptionEndsAt: new Date(Date.now() - 1 * DAY),
    });
    const res = await run();
    const body = await res.json();
    expect(body.refilled).toBe(1);
    expect(body.expired).toBe(1);
    expect(u.subscriptionCredits).toBe(0);
    expect(u.purchasedCredits).toBe(20);
    expect(u.credits).toBe(20);
    expect(u.planId).toBeNull();
    expect(u.monthlyCredits).toBe(0);
    // Free-tier drip starts next cycle, not in this run.
    expect(u.bonusCredits).toBe(0);
  });

  // ── Recurring subscriptions must survive a late renewal ───────────────────
  // Regression: the lapse step used to select purely on subscriptionEndsAt and
  // null razorpaySubscriptionId. A renewal delayed past the 3-day grace (soft
  // decline, bank outage, webhook backlog) therefore severed the link, and the
  // retried subscription.charged could no longer find the user — money taken,
  // no credits, no Purchase row, no alert, and the mandate still live.
  it("does not lapse a recurring subscription during the retry window", async () => {
    const u = user({
      razorpaySubscriptionId: "sub_live_1",
      subscriptionCredits: 40,
      subscriptionEndsAt: new Date(Date.now() - 2 * DAY), // renewal 2 days late
    });
    const body = await (await run()).json();
    expect(body.expired).toBe(0);
    expect(u.razorpaySubscriptionId).toBe("sub_live_1");
    expect(u.planId).toBe("plan-1");
    expect(u.subscriptionCredits).toBe(40);
    expect(cancelledSubs).toEqual([]);
  });

  it("lapses a recurring subscription once the retry window closes, cancelling the mandate first", async () => {
    const u = user({
      razorpaySubscriptionId: "sub_dead_1",
      subscriptionCredits: 40,
      purchasedCredits: 15,
      subscriptionEndsAt: new Date(Date.now() - 20 * DAY), // past the 14-day grace
    });
    const body = await (await run()).json();
    expect(body.expired).toBe(1);
    // The mandate must be stopped before we drop the link, or Razorpay keeps
    // charging a user we've just moved to the free tier.
    expect(cancelledSubs).toEqual(["sub_dead_1"]);
    expect(u.razorpaySubscriptionId).toBeNull();
    expect(u.planId).toBeNull();
    expect(u.subscriptionCredits).toBe(0);
    expect(u.purchasedCredits).toBe(15);
  });

  it("keeps the link intact when the mandate cannot be cancelled, and retries next run", async () => {
    cancelShouldFail = true;
    const u = user({
      razorpaySubscriptionId: "sub_flaky_1",
      subscriptionCredits: 40,
      subscriptionEndsAt: new Date(Date.now() - 20 * DAY),
    });
    const body = await (await run()).json();
    expect(body.expired).toBe(0);
    // Orphaning the subscription is the exact failure this guards against.
    expect(u.razorpaySubscriptionId).toBe("sub_flaky_1");
    expect(u.subscriptionCredits).toBe(40);
  });

  it("nulls nextRefillAt once the next refill would pass term end", async () => {
    const u = user({
      nextRefillAt: new Date(Date.now() - DAY),
      subscriptionEndsAt: new Date(Date.now() + 10 * DAY), // sooner than +1 month
    });
    await run();
    expect(u.credits).toBe(140);
    expect(u.nextRefillAt).toBeNull();
  });

  it("expires lapsed subscriptions, zeroes only the subscription bucket", async () => {
    const u = user({
      purchasedCredits: 25,
      subscriptionCredits: 8,
      subscriptionEndsAt: new Date(Date.now() - DAY),
      nextRefillAt: null,
    });
    const res = await run();
    const body = await res.json();
    expect(body.expired).toBe(1);
    expect(u.planId).toBeNull();
    expect(u.subscriptionEndsAt).toBeNull();
    expect(u.subscriptionCredits).toBe(0);
    expect(u.purchasedCredits).toBe(25);
    expect(u.credits).toBe(25);
    // Lapsed user rejoins the free-tier drip.
    expect(u.freeCreditsRefillAt).not.toBeNull();
  });

  it("caps refills at 2x the monthly grant (rollover)", async () => {
    const u = user({
      subscriptionCredits: 250, // more than one unused month banked
      monthlyCredits: 140,
      nextRefillAt: new Date(Date.now() - DAY),
    });
    await run();
    // min(250 + 140, 2*140) = 280 -> only 30 applied.
    expect(u.subscriptionCredits).toBe(280);
    expect(u.credits).toBe(280);
  });

  it("expires stale bonus credits", async () => {
    const u = user({
      bonusCredits: 12,
      purchasedCredits: 5,
      bonusCreditsExpireAt: new Date(Date.now() - DAY),
      subscriptionEndsAt: null,
      planId: null,
    });
    const res = await run();
    const body = await res.json();
    expect(body.bonusExpired).toBe(1);
    expect(u.bonusCredits).toBe(0);
    expect(u.credits).toBe(5);
    expect(u.bonusCreditsExpireAt).toBeNull();
  });

  it("grants the free-tier monthly drip and advances the anchor", async () => {
    const u = user({
      planId: null,
      subscriptionEndsAt: null,
      freeCreditsRefillAt: new Date(Date.now() - DAY),
    });
    const res = await run();
    const body = await res.json();
    expect(body.freeGranted).toBe(1);
    expect(u.bonusCredits).toBe(10);
    expect(u.bonusCreditsExpireAt).not.toBeNull();
    expect(u.freeCreditsRefillAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not grant the free drip to active subscribers", async () => {
    const u = user({
      planId: "plan-1",
      freeCreditsRefillAt: new Date(Date.now() - DAY),
    });
    const res = await run();
    const body = await res.json();
    expect(body.freeGranted).toBe(0);
    expect(u.bonusCredits).toBe(0);
  });
});
