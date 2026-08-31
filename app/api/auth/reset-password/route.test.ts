import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: this route had zero rate limiting at all (no rateLimit call,
// not even in PUBLIC_API_PREFIXES/GROUP_LIMITS) — an unauthenticated caller
// holding any valid token could trigger unlimited bcrypt.hash(cost 12) calls.

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 2 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));

let storedUserId: string | null = "u1";
const del = vi.fn(async () => {});
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => storedUserId), del },
}));

const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update } } }));

const invalidateAllSessions = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({ invalidateAllSessions }));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rateLimitAllowed = true;
  storedUserId = "u1";
  vi.clearAllMocks();
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password and invalidates sessions on a valid token", async () => {
    const res = await POST(post({ token: "tok", password: "longenough1" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "hashed" } });
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1");
    expect(del).toHaveBeenCalled();
  });

  it("429s once rate-limited, before ever touching Redis or bcrypt", async () => {
    rateLimitAllowed = false;
    const res = await POST(post({ token: "tok", password: "longenough1" }));
    expect(res.status).toBe(429);
    expect(update).not.toHaveBeenCalled();
  });

  it("still validates input before rate limiting matters (400 on a too-short password)", async () => {
    const res = await POST(post({ token: "tok", password: "short" }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("400s on an expired/invalid token without touching bcrypt", async () => {
    storedUserId = null;
    const res = await POST(post({ token: "bad-tok", password: "longenough1" }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
