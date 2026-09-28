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
const order: string[] = [];
const del = vi.fn(async () => { order.push("del"); });
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => storedUserId), del },
}));

let userRow: { id: string; email: string; name: string | null; emailVerifiedAt: Date | null } | null;
const findUnique = vi.fn(async () => userRow);
const update = vi.fn(async () => { order.push("update"); return {}; });
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique, update } } }));

const invalidateAllSessions = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({ invalidateAllSessions }));

const claimUnverifiedAccount = vi.fn(async () => {});
vi.mock("@/lib/account-claim", () => ({ claimUnverifiedAccount }));

const sendPasswordChangedAlertEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendPasswordChangedAlertEmail }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

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
  userRow = { id: "u1", email: "u1@test.local", name: "Ada Lovelace", emailVerifiedAt: new Date() };
  order.length = 0;
  vi.clearAllMocks();
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password, stamps passwordChangedAt, revokes sessions and alerts the owner", async () => {
    const res = await POST(post({ token: "tok", password: "longenough1" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed", hasPassword: true, passwordChangedAt: expect.any(Date) },
    });
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1");
    expect(sendPasswordChangedAlertEmail).toHaveBeenCalledWith("u1@test.local", "Ada", expect.any(String));
    expect(claimUnverifiedAccount).not.toHaveBeenCalled();
  });

  it("burns the token before changing anything, so a racing second request finds it gone", async () => {
    await POST(post({ token: "tok", password: "longenough1" }));
    expect(order.indexOf("del")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("del")).toBeLessThan(order.indexOf("update"));
  });

  it("claims a never-verified account: keeps the new password but drops planted 2FA/sessions", async () => {
    userRow = { ...userRow!, emailVerifiedAt: null };
    const res = await POST(post({ token: "tok", password: "longenough1" }));
    expect(res.status).toBe(200);
    expect(claimUnverifiedAccount).toHaveBeenCalledWith("u1", { passwordHash: "hashed" });
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

  it("400s on a password longer than bcrypt can hash (72 bytes)", async () => {
    const res = await POST(post({ token: "tok", password: "x".repeat(73) }));
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
