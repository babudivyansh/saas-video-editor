import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("@/lib/email", () => ({ sendCreditsRefilledEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn(async () => {}) } }));

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  name: string | null;
  credits: number;
  monthlyCredits: number;
  subscriptionEndsAt: Date | null;
  nextRefillAt: Date | null;
  planId: string | null;
  subscriptionId: string | null;
  lowCreditEmailSentAt: Date | null;
}
let users: UserRow[];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // lib/credits grantCredits runs inside a transaction and writes ledger rows.
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)(
        (await import("@/lib/prisma")).prisma,
      );
    }),
    creditTransaction: { create: vi.fn(async () => ({})) },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, { not?: null; lte?: Date }> }) => {
        const now = new Date();
        if (where.nextRefillAt) {
          return users.filter((u) => u.nextRefillAt !== null && u.nextRefillAt <= now);
        }
        return users.filter((u) => u.subscriptionEndsAt !== null && u.subscriptionEndsAt <= now);
      }),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: Partial<UserRow> & { credits?: { increment: number } };
      }) => {
        const u = users.find((x) => x.id === where.id)!;
        if (data.credits && typeof data.credits === "object") u.credits += data.credits.increment;
        for (const k of ["planId", "subscriptionId", "subscriptionEndsAt", "nextRefillAt", "monthlyCredits", "lowCreditEmailSentAt"] as const) {
          if (k in data) (u as Record<string, unknown>)[k] = (data as Record<string, unknown>)[k];
        }
        return u;
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
  vi.clearAllMocks();
});

function user(overrides: Partial<UserRow>): UserRow {
  const u: UserRow = {
    id: `u${users.length + 1}`,
    email: "u@test.co",
    firstName: null,
    name: null,
    credits: 0,
    monthlyCredits: 140,
    subscriptionEndsAt: new Date(Date.now() + 300 * DAY),
    nextRefillAt: null,
    planId: "plan-1",
    subscriptionId: "order-1",
    lowCreditEmailSentAt: null,
    ...overrides,
  };
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

  it("grants the final due refill even when the term has already lapsed (late cron run)", async () => {
    // Refill was due 3 days ago; term ended yesterday; cron only fires now.
    // The refill was paid for and must be granted before expiry clears state.
    const u = user({
      nextRefillAt: new Date(Date.now() - 3 * DAY),
      subscriptionEndsAt: new Date(Date.now() - 1 * DAY),
    });
    const res = await run();
    const body = await res.json();
    expect(u.credits).toBe(140);
    expect(body.refilled).toBe(1);
    expect(body.expired).toBe(1);
    // Expiry then clears subscription state but keeps granted credits.
    expect(u.planId).toBeNull();
    expect(u.monthlyCredits).toBe(0);
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

  it("expires lapsed subscriptions and keeps remaining credits", async () => {
    const u = user({
      credits: 33,
      subscriptionEndsAt: new Date(Date.now() - DAY),
      nextRefillAt: null,
    });
    const res = await run();
    const body = await res.json();
    expect(body.expired).toBe(1);
    expect(u.planId).toBeNull();
    expect(u.subscriptionEndsAt).toBeNull();
    expect(u.credits).toBe(33);
  });
});
