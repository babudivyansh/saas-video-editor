// POST /api/admin/users/bulk — suspend also revokes API keys, and a failed
// per-account session revocation is logged and reported, never swallowed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const invalidateSession = vi.hoisted(() => vi.fn(async (_id: string) => {}));
const revokeAllApiKeys = vi.hoisted(() => vi.fn(async () => 0));
const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co", sessionId: "as1" })),
  invalidateSession,
  revokeAllApiKeys,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn() } }));

const userUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, role: "USER" }))),
      updateMany: userUpdateMany,
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)), set: vi.fn(async () => {}), del: vi.fn(async () => {}), getStrict: vi.fn(async () => null), setStrict: vi.fn(async () => {}), delStrict: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 4 })),
  getClientIp: vi.fn(() => "unknown"),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/users/bulk", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSession.mockImplementation(async () => {});
});

describe("POST /api/admin/users/bulk", () => {
  it("suspend revokes every target's API keys and sessions", async () => {
    const res = await post({ ids: ["u1", "u2"], action: "suspend", confirmPhrase: "2 users", reason: "spam ring" });
    expect(res.status).toBe(200);
    expect(revokeAllApiKeys).toHaveBeenCalledWith(["u1", "u2"]);
    expect(invalidateSession).toHaveBeenCalledTimes(2);
    expect(await res.json()).toMatchObject({ ok: true, affected: 2, sessionRevokeFailed: [] });
  });

  it("logs and reports accounts whose session revocation failed", async () => {
    invalidateSession.mockImplementation(async (id: string) => {
      if (id === "u2") throw new Error("redis down");
    });
    const res = await post({ ids: ["u1", "u2", "u3"], action: "revoke_sessions", confirmPhrase: "3 users", reason: "incident" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, affected: 3, sessionRevokeFailed: ["u2"] });
    expect(logError).toHaveBeenCalledWith("admin-user-bulk", expect.stringContaining("u2"), expect.any(Error));
    // Sign-out alone doesn't touch API keys; only suspend does.
    expect(revokeAllApiKeys).not.toHaveBeenCalled();
  });

  it("unsuspend neither revokes keys nor signs anyone out", async () => {
    const res = await post({ ids: ["u1"], action: "unsuspend", confirmPhrase: "1 users", reason: "appeal granted" });
    expect(res.status).toBe(200);
    expect(revokeAllApiKeys).not.toHaveBeenCalled();
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});
