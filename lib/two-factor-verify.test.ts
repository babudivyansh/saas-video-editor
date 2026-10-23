import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/encryption", () => ({ decryptSecret: vi.fn(() => "secret") }));
let totpStep: number | null = null;
vi.mock("@/lib/totp", () => ({
  verifyTotpStep: vi.fn(() => totpStep),
  hashRecoveryCode: vi.fn((c: string) => `h:${c}`),
}));
let recoveryCount = 0;
const userUpdateMany = vi.fn(async () => ({ count: 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { updateMany: userUpdateMany },
    twoFactorRecoveryCode: { updateMany: vi.fn(async () => ({ count: recoveryCount })) },
  },
}));
const sendTwoFactorLockoutAlertEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendTwoFactorLockoutAlertEmail }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { verifySecondFactor, verifyStepUpSecondFactor, USER_MAX_FAILURES } = await import("./two-factor-verify");

const user = { id: "u1", email: "a@test.com", name: "Ada Lovelace", twoFactorSecretEnc: "enc", twoFactorEnabled: true };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  totpStep = null;
  recoveryCount = 0;
});

describe("verifySecondFactor", () => {
  it("accepts a live TOTP code and burns its step", async () => {
    totpStep = 7;
    expect(await verifySecondFactor(user, "123456")).toBe("ok");
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { twoFactorLastUsedStep: 7 } }));
  });

  it("accepts an unused recovery code", async () => {
    recoveryCount = 1;
    expect(await verifySecondFactor(user, "ABCD-EFGH")).toBe("ok");
  });

  it("locks after the per-account limit, emails once, and then refuses even the right code", async () => {
    for (let i = 1; i < USER_MAX_FAILURES; i++) expect(await verifySecondFactor(user, "000000")).toBe("invalid");
    expect(await verifySecondFactor(user, "000000")).toBe("locked");
    expect(sendTwoFactorLockoutAlertEmail).toHaveBeenCalledWith("a@test.com", "Ada", expect.any(String), 15);

    totpStep = 7;
    expect(await verifySecondFactor(user, "123456")).toBe("locked");
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(sendTwoFactorLockoutAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("a correct code clears the failure count", async () => {
    for (let i = 1; i < USER_MAX_FAILURES; i++) await verifySecondFactor(user, "000000");
    totpStep = 7;
    expect(await verifySecondFactor(user, "123456")).toBe("ok");
    totpStep = null;
    expect(await verifySecondFactor(user, "000000")).toBe("invalid");
  });
});

describe("verifyStepUpSecondFactor", () => {
  it("is a no-op when 2FA is off", async () => {
    expect(await verifyStepUpSecondFactor({ ...user, twoFactorEnabled: false }, undefined)).toEqual({ ok: true });
  });

  it("asks for a code when 2FA is on and none was sent", async () => {
    expect(await verifyStepUpSecondFactor(user, "")).toMatchObject({ ok: false, status: 400, twoFactorRequired: true });
  });

  it("rejects a wrong code and accepts a right one", async () => {
    expect(await verifyStepUpSecondFactor(user, "000000")).toMatchObject({ ok: false, status: 400 });
    totpStep = 7;
    expect(await verifyStepUpSecondFactor(user, " 123456 ")).toEqual({ ok: true });
  });

  it("429s while the account's second factor is locked", async () => {
    store.set("2fa-user-lock:u1", "1");
    totpStep = 7;
    expect(await verifyStepUpSecondFactor(user, "123456")).toMatchObject({ ok: false, status: 429 });
  });
});
