import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Step two of signup: the emailed code proves the inbox, and only then is the
// account created — verified — with its grants, referral and session.

const grantFreeTierMinutes = vi.hoisted(() => vi.fn(async () => ({ bonus: 30, subscription: 0, purchased: 0, total: 30 })));
vi.mock("@/lib/minutes", () => ({ grantFreeTierMinutes }));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: 4 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

vi.mock("@/lib/auth", () => ({
  completeLogin: vi.fn(async () => ({ token: "tok-1", sessionId: "s1", device: "test", ip: "9.9.9.9" })),
  setSessionCookie: vi.fn(() => {}),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/marketing-analytics", () => ({ recordSignupAttribution: vi.fn(async () => {}) }));

const sendWelcomeEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendWelcomeEmail }));

const attributeReferral = vi.fn(async () => null);
vi.mock("@/lib/affiliate", () => ({ attributeReferral }));

let codeOk = true;
const consumeOtp = vi.hoisted(() => vi.fn(async () => codeOk));
vi.mock("@/lib/otp", () => ({ consumeOtp }));

type Pending = { name: string; passwordHash: string; referralCode: string | null } | null;
let pending: Pending;
const clearPendingSignup = vi.fn(async () => {});
vi.mock("@/lib/signup-pending", () => ({
  readPendingSignup: vi.fn(async () => pending),
  clearPendingSignup,
}));

let createError: unknown = null;
const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
  if (createError) throw createError;
  return { id: "new-user-1", email: data.email, credits: data.credits };
});
vi.mock("@/lib/prisma", () => ({ prisma: { user: { create } } }));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/register/verify", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  rateLimitAllowed = true;
  codeOk = true;
  createError = null;
  pending = { name: "New User", passwordHash: "hashed", referralCode: null };
  vi.clearAllMocks();
});

describe("POST /api/auth/register/verify", () => {
  it("creates a verified account with the parked name and password, and signs it in", async () => {
    const res = await post({ email: "New@Test.com", otp: "123456" });
    expect(res.status).toBe(201);
    expect((await res.json()).token).toBe("tok-1");
    expect(consumeOtp).toHaveBeenCalledWith("signup", "new@test.com", "123456");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: "new@test.com",
        name: "New User",
        passwordHash: "hashed",
        hasPassword: true,
        emailVerifiedAt: expect.any(Date),
      }),
    }));
    expect(clearPendingSignup).toHaveBeenCalledWith("new@test.com");
    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@test.com", "New", 10);
  });

  it("creates nothing on a wrong code", async () => {
    codeOk = false;
    const res = await post({ email: "new@test.com", otp: "000000" });
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
    expect(clearPendingSignup).not.toHaveBeenCalled();
  });

  it("reports an expired signup so the client can go back to the form", async () => {
    pending = null;
    const res = await post({ email: "new@test.com", otp: "123456" });
    expect(res.status).toBe(400);
    expect((await res.json()).expired).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("429s after too many guesses, before checking the code", async () => {
    rateLimitAllowed = false;
    const res = await post({ email: "new@test.com", otp: "123456" });
    expect(res.status).toBe(429);
    expect(consumeOtp).not.toHaveBeenCalled();
  });

  it("409s if the address was registered while the code was in flight", async () => {
    createError = Object.assign(new Error("unique"), { code: "P2002" });
    const res = await post({ email: "new@test.com", otp: "123456" });
    expect(res.status).toBe(409);
  });

  it("grants the free tier's Clip Minutes, and survives the grant failing", async () => {
    await post({ email: "new@test.com", otp: "123456" });
    expect(grantFreeTierMinutes).toHaveBeenCalledWith("new-user-1", "grant:signup");
    grantFreeTierMinutes.mockRejectedValueOnce(new Error("db blip"));
    expect((await post({ email: "new@test.com", otp: "123456" })).status).toBe(201);
  });

  it("attributes the typed referral code with the trusted client IP, never leaking the affiliate", async () => {
    pending = { name: "New User", passwordHash: "hashed", referralCode: "JOH-N4X2" };
    attributeReferral.mockResolvedValueOnce({
      applied: true,
      code: "JOH-N4X2",
      affiliateId: "aff-1",
      affiliateUser: { userId: "owner-1", email: "owner@test.com", name: "Owner" },
    });
    const res = await post({ email: "new@test.com", otp: "123456" });
    const data = await res.json();
    expect(attributeReferral).toHaveBeenCalledWith(expect.objectContaining({
      typedCode: "JOH-N4X2",
      signupIp: "9.9.9.9",
      newUser: { id: "new-user-1", name: "New User" },
    }));
    expect(data.referral).toEqual({ applied: true, code: "JOH-N4X2" });
    expect(JSON.stringify(data)).not.toContain("owner@test.com");
  });

  it("omits the referral key entirely when no code or cookie was involved", async () => {
    const data = await (await post({ email: "new@test.com", otp: "123456" })).json();
    expect(data.referral).toBeUndefined();
  });
});
