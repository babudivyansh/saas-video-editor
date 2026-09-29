import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 7 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async (pw: string) => pw === "right-password") } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ setSessionCookie: vi.fn(), setLocaleCookieFromUser: vi.fn() }));

const finishLogin = vi.fn(async () => "tok-1");
vi.mock("@/lib/login-tail", () => ({ finishLogin }));
vi.mock("@/lib/two-factor-ticket", () => ({ mintTwoFactorTicket: vi.fn(async () => "ticket-1") }));

class OtpDeliveryError extends Error {}
const issueOtp = vi.fn(async () => ({}));
vi.mock("@/lib/otp", () => ({ issueOtp, OtpDeliveryError }));
const markPasswordProven = vi.fn(async () => "proof-1");
vi.mock("@/lib/login-verification", () => ({ markPasswordProven }));

type Row = {
  id: string; email: string; name: string | null; passwordHash: string; credits: number; preferredLanguage: string;
  emailVerifiedAt: Date | null; suspendedAt: Date | null; deactivatedAt: Date | null; twoFactorEnabled: boolean;
};
let user: Row | null;
const findUserByEmail = vi.fn(async (email: string) => (user && user.email === email ? user : null));
vi.mock("@/lib/identifier", async () => ({
  ...(await vi.importActual<typeof import("@/lib/identifier")>("@/lib/identifier")),
  findUserByEmail,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  user = {
    id: "u1", email: "a@test.com", name: "Ada", passwordHash: "h", credits: 5, preferredLanguage: "en",
    emailVerifiedAt: new Date(), suspendedAt: null, deactivatedAt: null, twoFactorEnabled: false,
  };
});

describe("POST /api/auth/login", () => {
  it("signs a verified account in by email + password", async () => {
    const res = await post({ email: "A@Test.com", password: "right-password" });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("tok-1");
    expect(findUserByEmail).toHaveBeenCalledWith("a@test.com");
  });

  it("still accepts the historical `identifier` field", async () => {
    const res = await post({ identifier: "a@test.com", password: "right-password" });
    expect(res.status).toBe(200);
  });

  it("asks a never-verified account for an emailed code instead of issuing a session", async () => {
    user!.emailVerifiedAt = null;
    const res = await post({ email: "a@test.com", password: "right-password" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ requiresEmailVerification: true, email: "a@test.com", passwordProof: "proof-1" });
    expect(data.token).toBeUndefined();
    expect(markPasswordProven).toHaveBeenCalledWith("a@test.com", "u1");
    expect(issueOtp).toHaveBeenCalledWith("login", "a@test.com");
    expect(finishLogin).not.toHaveBeenCalled();
  });

  it("does not reveal verification state on a wrong password", async () => {
    user!.emailVerifiedAt = null;
    const res = await post({ email: "a@test.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(issueOtp).not.toHaveBeenCalled();
  });

  it("flags a deactivated account so the client can offer reactivation", async () => {
    user!.deactivatedAt = new Date();
    const res = await post({ email: "a@test.com", password: "right-password" });
    expect(res.status).toBe(403);
    expect((await res.json()).deactivated).toBe(true);
  });

  it("no longer signs in by phone number", async () => {
    const res = await post({ method: "phone", identifier: "+911234567890", password: "right-password" });
    expect(res.status).toBe(401);
    expect(findUserByEmail).toHaveBeenCalledWith("+911234567890");
  });
});
