// POST /api/auth/2fa/enable — real TOTP maths (lib/totp is not mocked), so
// these catch an actual verification regression, not a mocked one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateTotp, generateTotpSecret, hashRecoveryCode } from "@/lib/totp";

let authUser: { userId: string } | null = { userId: "u1" };
const store = new Map<string, string>();
const userUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const codesCreate = vi.hoisted(() => vi.fn(async () => ({})));
const codesDelete = vi.hoisted(() => vi.fn(async () => ({})));
const sendAlert = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendTwoFactorChangedAlertEmail: sendAlert }));
// Identity "encryption" keeps the test about 2FA, not about key management.
vi.mock("@/lib/encryption", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s.replace(/^enc:/, "") }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    twoFactorRecoveryCode: { deleteMany: codesDelete, createMany: codesCreate },
    user: { update: userUpdate },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      user: { findUnique: vi.fn(async () => ({ email: "a@example.com", name: "Ada" })) },
    },
  };
});

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/2fa/enable", { method: "POST", body: JSON.stringify(body) }));

let secret: string;
beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1" };
  store.clear();
  secret = generateTotpSecret();
  store.set("2fa-setup:u1", `enc:${secret}`);
});

describe("POST /api/auth/2fa/enable", () => {
  it("enables 2FA with a valid code and returns ten one-time recovery codes, stored only as hashes", async () => {
    const res = await post({ code: generateTotp(secret) });
    expect(res.status).toBe(200);
    const { recoveryCodes } = await res.json();
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);

    const stored = (codesCreate.mock.calls[0] as unknown as [{ data: { codeHash: string }[] }])[0].data.map((d) => d.codeHash);
    expect(stored).toEqual(recoveryCodes.map((c: string) => hashRecoveryCode(c)));
    expect(stored).not.toContain(recoveryCodes[0]);

    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ twoFactorEnabled: true, twoFactorSecretEnc: `enc:${secret}`, twoFactorLastUsedStep: expect.any(Number) }),
    }));
    expect(store.has("2fa-setup:u1")).toBe(false);
    expect(sendAlert).toHaveBeenCalledWith("a@example.com", expect.any(String), true, expect.any(String));
  });

  it("rejects a wrong code and changes nothing", async () => {
    const real = generateTotp(secret);
    const wrong = String((Number(real) + 1) % 1_000_000).padStart(6, "0");
    expect((await post({ code: wrong })).status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(store.has("2fa-setup:u1")).toBe(true);
  });

  it("refuses when setup was never started or has expired", async () => {
    store.clear();
    expect((await post({ code: "123456" })).status).toBe(400);
  });

  it("requires a session and a code", async () => {
    expect((await post({})).status).toBe(400);
    authUser = null;
    expect((await post({ code: "123456" })).status).toBe(401);
  });
});
