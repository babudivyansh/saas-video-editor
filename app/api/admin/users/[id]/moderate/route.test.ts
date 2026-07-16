import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
  invalidateSession: vi.fn(async () => {}),
}));

let user: { suspendedAt: Date | null; role: string } | null;
let updates: Array<Record<string, unknown>>;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => user),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { POST } = await import("./route");
const { invalidateSession } = await import("@/lib/auth");

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/admin/users/${id}/moderate`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  user = { suspendedAt: null, role: "USER" };
  updates = [];
  vi.clearAllMocks();
});

describe("user moderation", () => {
  it("suspend sets suspendedAt AND revokes the live session", async () => {
    const res = await post("u1", { action: "suspend", reason: "abuse" });
    expect(res.status).toBe(200);
    expect(updates[0].suspendedAt).toBeInstanceOf(Date);
    expect(invalidateSession).toHaveBeenCalledWith("u1");
  });

  it("suspending an already-suspended user returns 409", async () => {
    user = { suspendedAt: new Date(), role: "USER" };
    expect((await post("u1", { action: "suspend" })).status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("refuses to suspend an admin account", async () => {
    user = { suspendedAt: null, role: "ADMIN" };
    expect((await post("u1", { action: "suspend" })).status).toBe(409);
  });

  it("refuses self-suspension", async () => {
    expect((await post("admin-1", { action: "suspend" })).status).toBe(400);
  });

  it("unsuspend clears suspendedAt", async () => {
    user = { suspendedAt: new Date(), role: "USER" };
    const res = await post("u1", { action: "unsuspend" });
    expect(res.status).toBe(200);
    expect(updates[0].suspendedAt).toBeNull();
  });

  it("revoke_sessions works without touching the user row", async () => {
    const res = await post("u1", { action: "revoke_sessions" });
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
    expect(invalidateSession).toHaveBeenCalledWith("u1");
  });
});
