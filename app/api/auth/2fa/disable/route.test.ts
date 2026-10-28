// POST /api/auth/2fa/disable — the strongest control on the account, so:
// step-up required, secret and recovery codes wiped, every OTHER session
// signed out, and an alert email sent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let stepUpOk = true;
const txOps: string[] = [];
const invalidateAllSessions = vi.hoisted(() => vi.fn(async () => {}));
const revokeAllApiKeys = vi.hoisted(() => vi.fn(async () => 0));
const sendAlert = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", sessionId: "sess-this" })),
  invalidateAllSessions,
  revokeAllApiKeys,
}));
vi.mock("@/lib/step-up", () => ({ verifyStepUp: vi.fn(async () => (stepUpOk ? { ok: true } : { ok: false, error: "Incorrect password" })) }));
// The TOTP half of the step-up (lib/two-factor-verify.test.ts covers it).
let secondFactor: { ok: true } | { ok: false; status: number; error: string; twoFactorRequired: true } = { ok: true };
const verifyStepUpSecondFactor = vi.hoisted(() => vi.fn());
vi.mock("@/lib/two-factor-verify", () => ({ verifyStepUpSecondFactor }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendTwoFactorChangedAlertEmail: sendAlert }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", email: "a@example.com", name: "Ada" })),
      update: vi.fn((args: unknown) => { txOps.push(`user.update:${JSON.stringify(args)}`); return args; }),
    },
    twoFactorRecoveryCode: { deleteMany: vi.fn((args: unknown) => { txOps.push(`codes.deleteMany:${JSON.stringify(args)}`); return args; }) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/2fa/disable", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  stepUpOk = true;
  secondFactor = { ok: true };
  verifyStepUpSecondFactor.mockImplementation(async () => secondFactor);
  txOps.length = 0;
});

describe("POST /api/auth/2fa/disable", () => {
  it("refuses without the step-up check and touches nothing", async () => {
    stepUpOk = false;
    const res = await post({ password: "wrong" });
    expect(res.status).toBe(400);
    expect(txOps).toHaveLength(0);
    expect(invalidateAllSessions).not.toHaveBeenCalled();
  });

  it("wipes the secret and recovery codes, signs out other devices, and alerts", async () => {
    const res = await post({ password: "right" });
    expect(res.status).toBe(200);
    expect(txOps.some((o) => o.startsWith("codes.deleteMany") && o.includes("u1"))).toBe(true);
    expect(txOps.some((o) => o.includes('"twoFactorEnabled":false') && o.includes('"twoFactorSecretEnc":null'))).toBe(true);
    // Keeps THIS session (the one that just re-authenticated), drops the rest.
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1", "sess-this");
    expect(revokeAllApiKeys).toHaveBeenCalledWith("u1");
    expect(sendAlert).toHaveBeenCalledWith("a@example.com", expect.any(String), false, expect.any(String));
  });
  it("with 2FA on, also requires an authenticator or recovery code", async () => {
    secondFactor = { ok: false, status: 400, error: "Enter the code from your authenticator app, or a recovery code", twoFactorRequired: true };
    const res = await post({ password: "right" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ twoFactorRequired: true });
    expect(verifyStepUpSecondFactor).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), undefined);
    expect(txOps).toHaveLength(0);
    expect(invalidateAllSessions).not.toHaveBeenCalled();
  });

  it("passes the submitted code through, and 429s while the account is locked", async () => {
    secondFactor = { ok: false, status: 429, error: "Too many incorrect codes. Try again in 15 minutes.", twoFactorRequired: true };
    const res = await post({ ...{ password: "right" }, twoFactorCode: "123456" });
    expect(res.status).toBe(429);
    expect(verifyStepUpSecondFactor).toHaveBeenCalledWith(expect.anything(), "123456");
  });
});
