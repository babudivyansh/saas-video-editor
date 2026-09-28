import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 4 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ setSessionCookie: vi.fn(), setLocaleCookieFromUser: vi.fn() }));

const finishLogin = vi.fn(async () => "tok-1");
vi.mock("@/lib/login-tail", () => ({ finishLogin }));
const mintTwoFactorTicket = vi.fn(async () => "ticket-1");
vi.mock("@/lib/two-factor-ticket", () => ({ mintTwoFactorTicket }));

let codeOk = true;
const consumeOtp = vi.fn(async () => codeOk);
vi.mock("@/lib/otp", () => ({ consumeOtp }));

let passwordProven = false;
vi.mock("@/lib/login-verification", () => ({ takePasswordProven: vi.fn(async () => passwordProven) }));

type Row = { id: string; email: string; name: string; credits: number; preferredLanguage: string; emailVerifiedAt: Date | null; suspendedAt: Date | null; deactivatedAt: Date | null; twoFactorEnabled: boolean };
let user: Row;
const claimUnverifiedAccount = vi.fn(async () => {
  // What the real claim does to the row: verified, 2FA wiped.
  user = { ...user, emailVerifiedAt: new Date(), twoFactorEnabled: false };
});
vi.mock("@/lib/account-claim", () => ({ claimUnverifiedAccount }));

vi.mock("@/lib/identifier", async () => ({
  ...(await vi.importActual<typeof import("@/lib/identifier")>("@/lib/identifier")),
  findUserByEmail: vi.fn(async () => user),
}));
const update = vi.fn(async ({ data }: { data: Partial<Row> }) => ({ ...user, ...data }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update } } }));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/verify-otp", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  codeOk = true;
  passwordProven = false;
  user = {
    id: "u1", email: "a@test.com", name: "Ada", credits: 5, preferredLanguage: "en",
    emailVerifiedAt: new Date(), suspendedAt: null, deactivatedAt: null, twoFactorEnabled: false,
  };
});

describe("POST /api/auth/verify-otp", () => {
  it("signs in with a correct sign-in code", async () => {
    const res = await post({ email: "a@test.com", otp: "123456" });
    expect(res.status).toBe(200);
    expect(consumeOtp).toHaveBeenCalledWith("login", "a@test.com", "123456");
    expect(claimUnverifiedAccount).not.toHaveBeenCalled();
  });

  it("401s on a wrong code", async () => {
    codeOk = false;
    expect((await post({ email: "a@test.com", otp: "000000" })).status).toBe(401);
    expect(finishLogin).not.toHaveBeenCalled();
  });

  it("just marks the address verified when the same login already proved the password", async () => {
    user.emailVerifiedAt = null;
    passwordProven = true;
    const res = await post({ email: "a@test.com", otp: "123456" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerifiedAt: expect.any(Date) } });
    expect(claimUnverifiedAccount).not.toHaveBeenCalled();
  });

  it("claims the account clean when only the inbox was proven (pre-registration takeover)", async () => {
    // A squatter registered this address and turned on 2FA; the inbox owner
    // signs in with a code. The squatter's 2FA must not lock them out, and
    // the squatter's password must stop working.
    user.emailVerifiedAt = null;
    user.twoFactorEnabled = true;
    const res = await post({ email: "a@test.com", otp: "123456" });
    expect(claimUnverifiedAccount).toHaveBeenCalledWith("u1");
    expect(res.status).toBe(200);
    expect(mintTwoFactorTicket).not.toHaveBeenCalled();
  });

  it("still requires 2FA on a verified account", async () => {
    user.twoFactorEnabled = true;
    const data = await (await post({ email: "a@test.com", otp: "123456" })).json();
    expect(data).toEqual({ requires2fa: true, ticket: "ticket-1" });
  });

  it("refuses suspended and deactivated accounts", async () => {
    user.suspendedAt = new Date();
    expect((await post({ email: "a@test.com", otp: "123456" })).status).toBe(403);
    user.suspendedAt = null;
    user.deactivatedAt = new Date();
    expect((await post({ email: "a@test.com", otp: "123456" })).status).toBe(403);
  });
});
