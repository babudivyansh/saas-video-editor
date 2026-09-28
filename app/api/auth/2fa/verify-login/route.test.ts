import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn(() => "9.9.9.9") }));
vi.mock("@/lib/auth", () => ({ setSessionCookie: vi.fn(), setLocaleCookieFromUser: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decryptSecret: vi.fn(() => "secret") }));

const finishLogin = vi.fn(async () => "tok-1");
vi.mock("@/lib/login-tail", () => ({ finishLogin }));

let totpStep: number | null = null;
vi.mock("@/lib/totp", () => ({
  verifyTotpStep: vi.fn(() => totpStep),
  hashRecoveryCode: vi.fn((c: string) => `h:${c}`),
}));

let ticket: { userId: string; reactivate?: boolean } | null;
const discardTwoFactorTicket = vi.fn(async () => {});
vi.mock("@/lib/two-factor-ticket", () => ({
  readTwoFactorTicket: vi.fn(async () => ticket),
  discardTwoFactorTicket,
  countFailedTwoFactorAttempt: vi.fn(async () => ({ lockedOut: false })),
}));

type Row = { id: string; email: string; name: string; credits: number; preferredLanguage: string; twoFactorEnabled: boolean; twoFactorSecretEnc: string; suspendedAt: Date | null; deactivatedAt: Date | null };
let user: Row;
let updateManyCount = 1;
let recoveryCount = 1;
const userUpdateMany = vi.fn(async () => ({ count: updateManyCount }));
const userUpdate = vi.fn(async () => ({}));
const recoveryUpdateMany = vi.fn(async () => ({ count: recoveryCount }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => user), updateMany: userUpdateMany, update: userUpdate },
    twoFactorRecoveryCode: { updateMany: recoveryUpdateMany },
  },
}));

const { POST } = await import("./route");

function post(code: string) {
  return (POST as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/auth/2fa/verify-login", { method: "POST", body: JSON.stringify({ ticket: "t1", code }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  totpStep = null;
  updateManyCount = 1;
  recoveryCount = 1;
  ticket = { userId: "u1" };
  user = {
    id: "u1", email: "a@test.com", name: "Ada", credits: 5, preferredLanguage: "en",
    twoFactorEnabled: true, twoFactorSecretEnc: "enc", suspendedAt: null, deactivatedAt: null,
  };
});

describe("POST /api/auth/2fa/verify-login", () => {
  it("accepts a live TOTP code by burning its time step conditionally", async () => {
    totpStep = 100;
    expect((await post("123456")).status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "u1" }),
      data: { twoFactorLastUsedStep: 100 },
    }));
  });

  it("rejects a TOTP code whose step another request already burned (replay race)", async () => {
    totpStep = 100;
    updateManyCount = 0;
    expect((await post("123456")).status).toBe(401);
    expect(finishLogin).not.toHaveBeenCalled();
  });

  it("spends a recovery code atomically — a second racing request gets nothing", async () => {
    expect((await post("ABCD-EFGH")).status).toBe(200);
    expect(recoveryUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", codeHash: "h:ABCD-EFGH", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    recoveryCount = 0;
    expect((await post("ABCD-EFGH")).status).toBe(401);
  });

  it("won't finish a login for an account deactivated after the password step", async () => {
    user.deactivatedAt = new Date();
    totpStep = 100;
    expect((await post("123456")).status).toBe(403);
  });

  it("lifts a deactivation only once the second factor has passed (reactivate ticket)", async () => {
    user.deactivatedAt = new Date();
    ticket = { userId: "u1", reactivate: true };
    totpStep = null;
    recoveryCount = 0;
    expect((await post("wrong")).status).toBe(401);
    expect(userUpdate).not.toHaveBeenCalled();

    totpStep = 100;
    expect((await post("123456")).status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { deactivatedAt: null, deactivationScheduledPurgeAt: null },
    });
  });
});
