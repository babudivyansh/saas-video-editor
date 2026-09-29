import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseBody: real.parseBody,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string }; params: unknown }) => Promise<Response>) =>
      async (req: NextRequest, ctx: { params: Promise<unknown> }) => {
        try {
          return await handler(req, { admin: { userId: "admin1" }, params: await ctx.params });
        } catch (e) {
          return real.mapHandlerError("test", req, e);
        }
      },
  };
});

const users: Record<string, { id: string; email: string; name: string | null; role: string; emailVerifiedAt: Date | null; twoFactorEnabled: boolean }> = {};
const tx = vi.fn(async (ops: unknown[]) => ops);
const userUpdate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null), update: (...a: unknown[]) => userUpdate(...(a as [])) },
    twoFactorRecoveryCode: { deleteMany: vi.fn(() => "deleteCodes") },
    $transaction: (ops: unknown[]) => tx(ops),
  },
}));
vi.mock("@/lib/auth", () => ({ invalidateOneSession: vi.fn(async () => {}) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
const audit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: (...a: unknown[]) => audit(...a), auditIp: () => "127.0.0.1" }));
vi.mock("@/lib/otp", () => ({ issueOtp: vi.fn(async () => ({})), OtpDeliveryError: class extends Error {} }));
const reset = vi.fn(async () => {});
vi.mock("@/lib/password-reset", () => ({ issuePasswordReset: (...a: unknown[]) => reset(...(a as [])) }));
vi.mock("@/lib/billing/cancel-subscription", () => ({ cancelSubscriptionForUser: vi.fn(async () => ({ ok: true, subscriptionCancelledAt: null, subscriptionEndsAt: null })) }));
const hardDelete = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/account-deletion", () => ({ hardDeleteUserAccount: (...a: unknown[]) => hardDelete(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");
const post = (id: string, body: unknown) =>
  POST(new NextRequest(`http://x/api/admin/users/${id}/actions`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const k of Object.keys(users)) delete users[k];
  users.u1 = { id: "u1", email: "Pat@Example.com", name: "Pat", role: "USER", emailVerifiedAt: null, twoFactorEnabled: true };
  users.a2 = { id: "a2", email: "boss@example.com", name: null, role: "ADMIN", emailVerifiedAt: new Date(), twoFactorEnabled: true };
  users.admin1 = { id: "admin1", email: "me@example.com", name: null, role: "USER", emailVerifiedAt: new Date(), twoFactorEnabled: false };
  vi.clearAllMocks();
});

describe("POST /api/admin/users/[id]/actions", () => {
  it("resets 2FA only with the user's email typed (case-insensitive) and a reason", async () => {
    expect((await post("u1", { action: "reset_2fa", confirmPhrase: "pat@example.co", reason: "lost phone" })).status).toBe(400);
    expect((await post("u1", { action: "reset_2fa", confirmPhrase: "pat@example.com" })).status).toBe(400); // no reason
    expect(tx).not.toHaveBeenCalled();

    const res = await post("u1", { action: "reset_2fa", confirmPhrase: "pat@example.com", reason: "lost phone, ID checked" });
    expect(res.status).toBe(200);
    expect(tx).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("admin1", "user.reset_2fa", "u1", expect.objectContaining({ reason: "lost phone, ID checked" }));
  });

  it("refuses to act on an ADMIN account, except signing out one of its devices", async () => {
    expect((await post("a2", { action: "send_password_reset" })).status).toBe(409);
    expect(reset).not.toHaveBeenCalled();
    expect((await post("a2", { action: "revoke_session", sessionId: "s1" })).status).toBe(200);
  });

  it("refuses to act on your own account", async () => {
    expect((await post("admin1", { action: "mark_email_verified", reason: "testing" })).status).toBe(400);
  });

  it("hard-deletes through the shared core, which removes stored files, and reports its refusal", async () => {
    hardDelete.mockResolvedValueOnce({ ok: false, reason: "Account has billing history" } as never);
    const refused = await post("u1", { action: "hard_delete", confirmPhrase: "pat@example.com", reason: "GDPR request" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toContain("billing history");

    expect((await post("u1", { action: "hard_delete", confirmPhrase: "pat@example.com", reason: "GDPR request" })).status).toBe(200);
    expect(hardDelete).toHaveBeenCalledWith("u1");
    expect(audit).toHaveBeenCalledWith("admin1", "user.hard_delete", "u1", expect.anything());
  });

  it("sends a password reset and marks email verified", async () => {
    expect((await post("u1", { action: "send_password_reset" })).status).toBe(200);
    expect(reset).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }));
    expect((await post("u1", { action: "mark_email_verified", reason: "confirmed by phone" })).status).toBe(200);
    expect(userUpdate).toHaveBeenCalled();
  });

  it("rejects an unknown action or a stray field", async () => {
    expect((await post("u1", { action: "make_admin" })).status).toBe(400);
    expect((await post("u1", { action: "send_password_reset", email: "x" })).status).toBe(400);
  });

  it("404s an unknown user", async () => {
    expect((await post("nope", { action: "send_password_reset" })).status).toBe(404);
  });
});
