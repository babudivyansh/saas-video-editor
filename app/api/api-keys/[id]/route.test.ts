import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: withRateLimit previously hardcoded a (req) => Promise<Response>
// signature and silently dropped a dynamic route's params object when
// wrapping it. PATCH/DELETE here are the first rate-limited handlers on a
// [id] route in this module — this pins that `{ params }` still reaches the
// handler once wrapped.

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 2 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));

const updateMany = vi.fn(async () => ({ count: 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: { apiKey: { updateMany: (...a: unknown[]) => (updateMany as unknown as (...x: unknown[]) => unknown)(...a) } },
}));

const { PATCH, DELETE } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  rateLimitAllowed = true;
  vi.clearAllMocks();
});

describe("PATCH /api/api-keys/[id]", () => {
  it("forwards the route's id param through the rate-limit wrapper", async () => {
    const req = new NextRequest("http://localhost/api/api-keys/key_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "renamed" }),
    });
    const res = await PATCH(req, ctx("key_1"));
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "key_1", userId: "u1" } }));
  });

  it("429s once rate-limited, before ever touching Prisma", async () => {
    rateLimitAllowed = false;
    const req = new NextRequest("http://localhost/api/api-keys/key_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "renamed" }),
    });
    const res = await PATCH(req, ctx("key_1"));
    expect(res.status).toBe(429);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/api-keys/[id]", () => {
  it("forwards the route's id param and scopes the revoke to the caller", async () => {
    const req = new NextRequest("http://localhost/api/api-keys/key_1", { method: "DELETE" });
    const res = await DELETE(req, ctx("key_1"));
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "key_1", userId: "u1", revokedAt: null } }));
  });

  it("429s once rate-limited, before ever touching Prisma", async () => {
    rateLimitAllowed = false;
    const req = new NextRequest("http://localhost/api/api-keys/key_1", { method: "DELETE" });
    const res = await DELETE(req, ctx("key_1"));
    expect(res.status).toBe(429);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
