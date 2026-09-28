import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 7 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async (pw: string) => pw === "right-password") } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ setSessionCookie: vi.fn(), setLocaleCookieFromUser: vi.fn() }));
vi.mock("@/lib/login-tail", () => ({ finishLogin: vi.fn(async () => "tok-1") }));
const mintTwoFactorTicket = vi.fn(async () => "ticket-1");
vi.mock("@/lib/two-factor-ticket", () => ({ mintTwoFactorTicket }));
class OtpDeliveryError extends Error {}
const issueOtp = vi.fn(async () => ({}));
vi.mock("@/lib/otp", () => ({ issueOtp, OtpDeliveryError }));
vi.mock("@/lib/login-verification", () => ({ markPasswordProven: vi.fn(async () => {}) }));

type Row = { id: string; email: string; name: string; passwordHash: string; credits: number; preferredLanguage: string; emailVerifiedAt: Date | null; suspendedAt: Date | null; deactivatedAt: Date | null; twoFactorEnabled: boolean };
let user: Row;
vi.mock("@/lib/identifier", async () => ({
  ...(await vi.importActual<typeof import("@/lib/identifier")>("@/lib/identifier")),
  findUserByEmail: vi.fn(async () => user),
}));
const update = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update } } }));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/account/reactivate", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  user = {
    id: "u1", email: "a@test.com", name: "Ada", passwordHash: "h", credits: 5, preferredLanguage: "en",
    emailVerifiedAt: new Date(), suspendedAt: null, deactivatedAt: new Date(), twoFactorEnabled: false,
  };
});

describe("POST /api/account/reactivate", () => {
  it("reactivates and signs in a non-2FA account", async () => {
    const res = await post({ email: "a@test.com", password: "right-password" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { deactivatedAt: null, deactivationScheduledPurgeAt: null } });
  });

  it("does NOT lift the deactivation on the password alone when 2FA is on", async () => {
    user.twoFactorEnabled = true;
    const data = await (await post({ email: "a@test.com", password: "right-password" })).json();
    expect(data).toEqual({ requires2fa: true, ticket: "ticket-1" });
    expect(mintTwoFactorTicket).toHaveBeenCalledWith("u1", { reactivate: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("sends a never-verified account through the one-time email check", async () => {
    user.emailVerifiedAt = null;
    const data = await (await post({ email: "a@test.com", password: "right-password" })).json();
    expect(data.requiresEmailVerification).toBe(true);
    expect(issueOtp).toHaveBeenCalledWith("login", "a@test.com");
    expect(data.token).toBeUndefined();
  });

  it("401s on a wrong password without touching the account", async () => {
    expect((await post({ email: "a@test.com", password: "nope" })).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
});
