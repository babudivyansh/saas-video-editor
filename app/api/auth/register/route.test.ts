import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 19 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));

vi.mock("@/lib/auth", () => ({
  completeLogin: vi.fn(async () => ({ token: "tok-1", sessionId: "s1", device: "test", ip: "9.9.9.9" })),
  setSessionCookie: vi.fn(() => {}),
}));

const sendWelcomeEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendWelcomeEmail }));

const attributeReferral = vi.fn(async () => null);
vi.mock("@/lib/affiliate", () => ({ attributeReferral }));

let emailTaken: boolean;
let phoneTaken: boolean;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; phone?: string } }) => {
        if (where.email) return emailTaken ? { id: "existing-1" } : null;
        if (where.phone) return phoneTaken ? { id: "existing-2" } : null;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "new-user-1",
        email: data.email,
        credits: data.credits,
      })),
    },
  },
}));

const { POST } = await import("./route");

const VALID_BODY = {
  firstName: "New",
  lastName: "User",
  email: "new@test.com",
  phone: "+911234567890",
  password: "password123",
  confirmPassword: "password123",
};

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  rateLimitAllowed = true;
  emailTaken = false;
  phoneTaken = false;
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("429s once the rate limit is exceeded, before ever touching the database", async () => {
    rateLimitAllowed = false;
    const res = await post(VALID_BODY);
    expect(res.status).toBe(429);
    expect(attributeReferral).not.toHaveBeenCalled();
  });

  it("409s on an already-registered email before any referral logic runs", async () => {
    emailTaken = true;
    const res = await post({ ...VALID_BODY, referralCode: "SOME-CODE" });
    expect(res.status).toBe(409);
    expect(attributeReferral).not.toHaveBeenCalled();
  });

  it("creates the account and includes the referral outcome when a code is applied", async () => {
    attributeReferral.mockResolvedValueOnce({
      applied: true,
      code: "JOH-N4X2",
      affiliateId: "aff-1",
      affiliateUser: { userId: "owner-1", email: "owner@test.com", firstName: "Owner", name: null },
    });
    const res = await post({ ...VALID_BODY, referralCode: "joh-n4x2" });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.referral).toEqual({ applied: true, code: "JOH-N4X2" });
    // The affiliate owner's own email must never reach the newly-registered client.
    expect(JSON.stringify(data)).not.toContain("owner@test.com");
  });

  it("still creates the account (201) when the referral code is invalid, with no Referral side effect surfaced", async () => {
    attributeReferral.mockResolvedValueOnce({ applied: false, reason: "invalid" });
    const res = await post({ ...VALID_BODY, referralCode: "GHOST-1" });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.referral).toEqual({ applied: false, reason: "invalid" });
  });

  it("omits the referral key entirely when no code or cookie was involved", async () => {
    attributeReferral.mockResolvedValueOnce(null);
    const res = await post(VALID_BODY);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.referral).toBeUndefined();
  });

  it("still enforces password-match validation", async () => {
    const res = await post({ ...VALID_BODY, confirmPassword: "different" });
    expect(res.status).toBe(400);
  });
});
