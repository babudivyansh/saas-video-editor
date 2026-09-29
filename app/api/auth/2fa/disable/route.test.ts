// POST /api/auth/2fa/disable — the strongest control on the account, so:
// step-up required, secret and recovery codes wiped, every OTHER session
// signed out, and an alert email sent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let stepUpOk = true;
const txOps: string[] = [];
const invalidateAllSessions = vi.hoisted(() => vi.fn(async () => {}));
const sendAlert = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", sessionId: "sess-this" })),
  invalidateAllSessions,
}));
vi.mock("@/lib/step-up", () => ({ verifyStepUp: vi.fn(async () => (stepUpOk ? { ok: true } : { ok: false, error: "Incorrect password" })) }));
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
    expect(sendAlert).toHaveBeenCalledWith("a@example.com", expect.any(String), false, expect.any(String));
  });
});
