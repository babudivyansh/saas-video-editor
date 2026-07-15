import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

let savedEndsAt: Date | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", subscriptionEndsAt: null })),
      update: vi.fn(async ({ data }: { data: { subscriptionEndsAt: Date | null } }) => {
        savedEndsAt = data.subscriptionEndsAt;
        return { id: "u1", subscriptionEndsAt: data.subscriptionEndsAt };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/subscriptions/extend", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  savedEndsAt = null;
  vi.clearAllMocks();
});

describe("subscription extend validation", () => {
  it("extends by the requested months", async () => {
    const res = await post({ userId: "u1", months: 3 });
    expect(res.status).toBe(200);
    const monthsAhead = (savedEndsAt!.getTime() - Date.now()) / (30 * 86400_000);
    expect(monthsAhead).toBeGreaterThan(2.5);
  });

  it("rejects months outside 1–24", async () => {
    expect((await post({ userId: "u1", months: 25 })).status).toBe(400);
    expect((await post({ userId: "u1", months: 0 })).status).toBe(400);
    expect(savedEndsAt).toBeNull();
  });

  it("expire=true ends the subscription now", async () => {
    const res = await post({ userId: "u1", expire: true });
    expect(res.status).toBe(200);
    expect(savedEndsAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
