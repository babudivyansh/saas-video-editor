import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Step one of signup: validate, park the form in Redis, email a code. The
// account itself is created by ./verify — this route must never create a
// user or a session.

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: rateLimitAllowed ? 19 : 0 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

class OtpDeliveryError extends Error {}
const issueOtp = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/otp", () => ({ issueOtp, OtpDeliveryError }));

const savePendingSignup = vi.hoisted(() => vi.fn(async () => "tok-1"));
vi.mock("@/lib/signup-pending", () => ({ savePendingSignup }));

let emailTaken: boolean;
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => (emailTaken ? { id: "existing-1" } : null)),
      create,
    },
  },
}));

const { POST } = await import("./route");

const VALID_BODY = {
  name: "New User",
  email: "New@Test.com",
  password: "password123",
  confirmPassword: "password123",
};

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  rateLimitAllowed = true;
  emailTaken = false;
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("parks the signup and emails a code — no account, no session", async () => {
    const res = await post({ ...VALID_BODY, referralCode: " JOH-N4X2 " });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toMatchObject({ pending: true, email: "new@test.com", signupToken: "tok-1" });
    expect(data.token).toBeUndefined();
    expect(savePendingSignup).toHaveBeenCalledWith("new@test.com", {
      name: "New User",
      passwordHash: "hashed",
      referralCode: "JOH-N4X2",
    });
    expect(issueOtp).toHaveBeenCalledWith("signup", "new@test.com");
    expect(create).not.toHaveBeenCalled();
  });

  it("passes a dev code through when the OTP layer returns one", async () => {
    issueOtp.mockResolvedValueOnce({ devCode: "123456" });
    const data = await (await post(VALID_BODY)).json();
    expect(data.devCode).toBe("123456");
  });

  it("503s instead of pretending success when the code can't be delivered", async () => {
    issueOtp.mockRejectedValueOnce(new OtpDeliveryError());
    const res = await post(VALID_BODY);
    expect(res.status).toBe(503);
  });

  it("429s once the rate limit is exceeded, before parking anything", async () => {
    rateLimitAllowed = false;
    const res = await post(VALID_BODY);
    expect(res.status).toBe(429);
    expect(savePendingSignup).not.toHaveBeenCalled();
  });

  it("409s on an already-registered email", async () => {
    emailTaken = true;
    const res = await post(VALID_BODY);
    expect(res.status).toBe(409);
    expect(issueOtp).not.toHaveBeenCalled();
  });

  it("requires a single name — no first/last split, no phone", async () => {
    expect((await post({ ...VALID_BODY, name: "   " })).status).toBe(400);
    expect((await post({ ...VALID_BODY, name: "x".repeat(61) })).status).toBe(400);
    // Old clients still sending first/last/phone without `name` are refused.
    const { name: _omit, ...legacy } = VALID_BODY;
    void _omit;
    expect((await post({ ...legacy, firstName: "New", lastName: "User", phone: "+911234567890" })).status).toBe(400);
  });

  it("enforces password rules (match, 8+, at most 72 bytes)", async () => {
    expect((await post({ ...VALID_BODY, confirmPassword: "different" })).status).toBe(400);
    expect((await post({ ...VALID_BODY, password: "short", confirmPassword: "short" })).status).toBe(400);
    const long = "x".repeat(73);
    expect((await post({ ...VALID_BODY, password: long, confirmPassword: long })).status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    expect((await post({ ...VALID_BODY, email: "not-an-email" })).status).toBe(400);
  });
});
