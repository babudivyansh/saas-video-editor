import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

interface UserRow {
  id: string;
  credits: number;
  monthlyCredits: number;
  subscriptionEndsAt: Date | null;
  nextRefillAt: Date | null;
}
let user: UserRow;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => user),
      // Mirrors the route's conditional-update semantics: only match when the
      // refill is due (nextRefillAt null or past) unless force bypasses. This
      // updateMany is only the idempotency claim (advances nextRefillAt) —
      // the actual credit grant is a separate bucket-aware grantCredits()
      // call below, matching the route's two-step shape.
      updateMany: vi.fn(async ({ where, data }: {
        where: { OR?: Array<{ nextRefillAt: null | { lte: Date } }> };
        data: { nextRefillAt: Date | null };
      }) => {
        const guarded = !!where.OR;
        const due = user.nextRefillAt === null || user.nextRefillAt <= new Date();
        if (guarded && !due) return { count: 0 };
        user.nextRefillAt = data.nextRefillAt;
        return { count: 1 };
      }),
      // lib/credits grantCredits({bucket:"subscription", amount}) — model the
      // whole balance as the subscription bucket for this test's purposes.
      update: vi.fn(async ({ data }: { data: { credits: { increment: number } } }) => {
        user.credits += data.credits.increment;
        return { bonusCredits: 0, subscriptionCredits: user.credits, purchasedCredits: 0 };
      }),
    },
    creditTransaction: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn((await import("@/lib/prisma")).prisma)),
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/subscriptions/refill", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  user = {
    id: "u1",
    credits: 100,
    monthlyCredits: 500,
    subscriptionEndsAt: new Date(Date.now() + 90 * 86400_000),
    nextRefillAt: null, // refill due
  };
  vi.clearAllMocks();
});

describe("manual refill idempotency", () => {
  it("grants monthly credits when a refill is due", async () => {
    const res = await post({ userId: "u1" });
    expect(res.status).toBe(200);
    expect(user.credits).toBe(600);
    expect(user.nextRefillAt).not.toBeNull();
  });

  it("a repeat refill gets 409 and credits are NOT granted twice", async () => {
    await post({ userId: "u1" });
    const res2 = await post({ userId: "u1" });
    expect(res2.status).toBe(409);
    expect(user.credits).toBe(600);
  });

  it("force bypasses the due-date guard (deliberate extra grant)", async () => {
    await post({ userId: "u1" });
    const res = await post({ userId: "u1", force: true });
    expect(res.status).toBe(200);
    expect(user.credits).toBe(1100);
  });

  it("refuses when there is no active subscription", async () => {
    user.subscriptionEndsAt = new Date(Date.now() - 1000);
    const res = await post({ userId: "u1" });
    expect(res.status).toBe(400);
  });

  it("rejects unknown body fields (strict schema)", async () => {
    const res = await post({ userId: "u1", credits: 99999 });
    expect(res.status).toBe(400);
  });
});
