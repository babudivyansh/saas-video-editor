import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn(() => "9.9.9.9") }));
vi.mock("@/lib/auth", () => ({
  setSessionCookie: vi.fn(),
  setLocaleCookieFromUser: vi.fn(),
  verifyToken: vi.fn(() => ({ userId: "u1", email: "a@test.com", sessionId: "s1" })),
}));
const grantElevation = vi.fn(async () => {});
vi.mock("@/lib/admin/elevation", () => ({ grantElevation, ELEVATION_HOURS: 8 }));
const auditEvent = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditEvent, auditIp: () => "9.9.9.9" }));
vi.mock("@/lib/encryption", () => ({ decryptSecret: vi.fn(() => "secret") }));

// In-memory Redis for lib/two-factor-verify's per-account counter and lock.
const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); }),
    incrWithExpire: vi.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    }),
    setNx: vi.fn(async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    }),
  },
}));
const sendTwoFactorLockoutAlertEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendTwoFactorLockoutAlertEmail }));

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

type Row = { id: string; role?: string; email: string; name: string; credits: number; preferredLanguage: string; twoFactorEnabled: boolean; twoFactorSecretEnc: string; suspendedAt: Date | null; deactivatedAt: Date | null };
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
  store.clear();
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

  it("locks the account's second factor after 10 wrong codes, however many tickets they're spread over", async () => {
    recoveryCount = 0;
    // A fresh ticket every time (the per-ticket counter is mocked to never trip).
    for (let i = 0; i < 9; i++) expect((await post("000000")).status).toBe(401);
    const locked = await post("000000");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ locked: true, expired: true });
    expect(discardTwoFactorTicket).toHaveBeenCalledWith("t1");
    expect(sendTwoFactorLockoutAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendTwoFactorLockoutAlertEmail).toHaveBeenCalledWith("a@test.com", "Ada", expect.any(String), 15);

    // Now even the right code is refused, without touching the TOTP step.
    totpStep = 100;
    expect((await post("123456")).status).toBe(429);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(finishLogin).not.toHaveBeenCalled();
    expect(sendTwoFactorLockoutAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("a correct code resets the account's failure count", async () => {
    recoveryCount = 0;
    for (let i = 0; i < 9; i++) await post("000000");
    totpStep = 100;
    expect((await post("123456")).status).toBe(200);
    totpStep = null;
    expect((await post("000000")).status).toBe(401);
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

describe("admin host: the sign-in is the admin step-up", () => {
  const postTo = (origin: string) =>
    (POST as (r: NextRequest) => Promise<Response>)(
      new NextRequest(`${origin}/api/auth/2fa/verify-login`, { method: "POST", body: JSON.stringify({ ticket: "t1", code: "123456" }) }),
    );

  beforeEach(() => {
    process.env.ADMIN_ORIGIN = "https://admin.clipiro.com";
    totpStep = 100;
  });
  afterEach(() => {
    delete process.env.ADMIN_ORIGIN;
  });

  it("unlocks the console for an admin who signs in on the admin host, and audits it", async () => {
    user.role = "ADMIN";
    expect((await postTo("https://admin.clipiro.com")).status).toBe(200);
    expect(grantElevation).toHaveBeenCalledWith("u1", "s1");
    expect(auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.elevated", sessionId: "s1" }));
  });

  it("does not unlock an admin who signs in on the main site", async () => {
    user.role = "ADMIN";
    expect((await postTo("https://clipiro.com")).status).toBe(200);
    expect(grantElevation).not.toHaveBeenCalled();
  });

  it("does not unlock a non-admin on the admin host", async () => {
    user.role = "USER";
    expect((await postTo("https://admin.clipiro.com")).status).toBe(200);
    expect(grantElevation).not.toHaveBeenCalled();
  });

  it("does not unlock anything when the second factor fails", async () => {
    user.role = "ADMIN";
    totpStep = null;
    recoveryCount = 0; // nor a recovery code
    expect((await postTo("https://admin.clipiro.com")).status).not.toBe(200);
    expect(grantElevation).not.toHaveBeenCalled();
  });
});
