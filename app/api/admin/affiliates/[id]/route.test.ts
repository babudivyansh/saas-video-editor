import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

let updates: Array<Record<string, unknown>>;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliate: {
      findUnique: vi.fn(async () => ({ status: "active", commissionRate: 0.2 })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "a1", ...data };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { PATCH } = await import("./route");

const patch = (body: unknown) =>
  PATCH(
    new NextRequest("http://localhost/api/admin/affiliates/a1", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "a1" }) },
  );

beforeEach(() => {
  updates = [];
  vi.clearAllMocks();
});

describe("affiliate PATCH validation", () => {
  it("accepts a valid status and bounded rate", async () => {
    const res = await patch({ status: "banned", commissionRate: 0.3 });
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ status: "banned", commissionRate: 0.3 });
  });

  it("rejects an unknown status", async () => {
    const res = await patch({ status: "frozen" });
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].path).toBe("status");
    expect(updates).toHaveLength(0);
  });

  it("rejects a commissionRate above 0.5 (the 200%-typo guard)", async () => {
    const res = await patch({ commissionRate: 2 });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("rejects an empty patch", async () => {
    const res = await patch({});
    expect(res.status).toBe(400);
  });
});
