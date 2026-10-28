// POST /api/auth/2fa/recovery-codes — minting fresh codes is as strong as
// disabling 2FA (a recovery code IS a second factor), so it takes the same
// step-up: password/emailed code AND an authenticator or recovery code.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let stepUpOk = true;
let user: { id: string; twoFactorEnabled: boolean } | null;
const codesDelete = vi.hoisted(() => vi.fn(async () => ({})));
const codesCreate = vi.hoisted(() => vi.fn(async () => ({})));
const verifyStepUpSecondFactor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", sessionId: "s1" })) }));
vi.mock("@/lib/step-up", () => ({ verifyStepUp: vi.fn(async () => (stepUpOk ? { ok: true } : { ok: false, error: "Incorrect password" })) }));
vi.mock("@/lib/two-factor-verify", () => ({ verifyStepUpSecondFactor }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => {
  const tx = { twoFactorRecoveryCode: { deleteMany: codesDelete, createMany: codesCreate } };
  return {
    prisma: {
      user: { findUnique: vi.fn(async () => user) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };
});

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/2fa/recovery-codes", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  stepUpOk = true;
  user = { id: "u1", twoFactorEnabled: true };
  verifyStepUpSecondFactor.mockImplementation(async (_u: unknown, code: unknown) =>
    code === "123456"
      ? { ok: true }
      : { ok: false, status: 400, error: "Enter the code from your authenticator app, or a recovery code", twoFactorRequired: true });
});

describe("POST /api/auth/2fa/recovery-codes", () => {
  it("400s with the password but no authenticator code, and leaves the old codes alone", async () => {
    const res = await post({ password: "right" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ twoFactorRequired: true });
    expect(verifyStepUpSecondFactor).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), undefined);
    expect(codesDelete).not.toHaveBeenCalled();
    expect(codesCreate).not.toHaveBeenCalled();
  });

  it("400s on a wrong password before checking the second factor", async () => {
    stepUpOk = false;
    expect((await post({ password: "wrong", twoFactorCode: "123456" })).status).toBe(400);
    expect(verifyStepUpSecondFactor).not.toHaveBeenCalled();
    expect(codesCreate).not.toHaveBeenCalled();
  });

  it("passes a 429 lockout through", async () => {
    verifyStepUpSecondFactor.mockResolvedValueOnce({ ok: false, status: 429, error: "Too many incorrect codes.", twoFactorRequired: true });
    expect((await post({ password: "right", twoFactorCode: "000000" })).status).toBe(429);
    expect(codesCreate).not.toHaveBeenCalled();
  });

  it("issues ten fresh codes with both factors", async () => {
    const res = await post({ password: "right", twoFactorCode: "123456" });
    expect(res.status).toBe(200);
    expect((await res.json()).recoveryCodes).toHaveLength(10);
    expect(codesDelete).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("409s when 2FA is off", async () => {
    user = { id: "u1", twoFactorEnabled: false };
    expect((await post({ password: "right", twoFactorCode: "123456" })).status).toBe(409);
  });
});
