import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: this route had no rate limiting at all — a caller holding a
// valid session JWT could brute-force `currentPassword` against bcrypt with
// no throttle (unlike every sibling identity-mutation route in this module).

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 2 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

let authUser: { userId: string; sessionId: string } | null = { userId: "u1", sessionId: "s1" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  invalidateAllSessions: vi.fn(async () => {}),
}));

const CURRENT_HASH = "current-hash";
const findUnique = vi.fn(async () => ({
  id: "u1",
  email: "u1@example.com",
  firstName: "U",
  name: "U1",
  passwordHash: CURRENT_HASH,
}));
const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => (findUnique as unknown as (...x: unknown[]) => unknown)(...a), update: (...a: unknown[]) => (update as unknown as (...x: unknown[]) => unknown)(...a) } },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (plain: string, hash: string) => plain === "correct-current" && hash === CURRENT_HASH),
    hash: vi.fn(async () => "new-hash"),
  },
}));

vi.mock("@/lib/email", () => ({ sendPasswordChangedAlertEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rateLimitAllowed = true;
  authUser = { userId: "u1", sessionId: "s1" };
  vi.clearAllMocks();
});

describe("POST /api/auth/change-password", () => {
  it("changes the password on a valid current password", async () => {
    const res = await POST(post({ currentPassword: "correct-current", newPassword: "longenough1" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "u1" },
      data: expect.objectContaining({ passwordHash: "new-hash" }),
    }));
  });

  it("429s once rate-limited, before ever touching bcrypt or Prisma", async () => {
    rateLimitAllowed = false;
    const res = await POST(post({ currentPassword: "correct-current", newPassword: "longenough1" }));
    expect(res.status).toBe(429);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("400s on an incorrect current password without updating anything", async () => {
    const res = await POST(post({ currentPassword: "wrong", newPassword: "longenough1" }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("400s on a too-short new password before touching bcrypt", async () => {
    const res = await POST(post({ currentPassword: "correct-current", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
