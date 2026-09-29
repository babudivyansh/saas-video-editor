// POST /api/auth/change-email — an identity-changing action: step-up
// required, the current email is never swapped here, and the confirmation
// link goes to the NEW address only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let stepUpOk = true;
let taken: { id: string } | null = null;
const userUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const redisSet = vi.hoisted(() => vi.fn(async () => {}));
const sendConfirm = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://clipiro.test" } }));
vi.mock("@/lib/step-up", () => ({ verifyStepUp: vi.fn(async () => (stepUpOk ? { ok: true } : { ok: false, error: "Incorrect password" })) }));
vi.mock("@/lib/email", () => ({ sendChangeEmailConfirmationEmail: sendConfirm }));
vi.mock("@/lib/redis", () => ({ redis: { set: redisSet } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id ? { id: "u1", email: "old@example.com", name: "Ada" } : taken),
      update: userUpdate,
    },
  },
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/change-email", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  stepUpOk = true;
  taken = null;
});

describe("POST /api/auth/change-email", () => {
  it("records the pending address and emails a 30-minute link to the NEW address only", async () => {
    const res = await post({ newEmail: " New@Example.com ", password: "pw" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pendingEmail: "new@example.com" });
    // User.email itself is untouched until the link is confirmed.
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { pendingEmail: "new@example.com" } });
    const [key, value, , ttl] = redisSet.mock.calls[0] as unknown as [string, string, string, number];
    expect(key).toMatch(/^change-email:[0-9a-f]{64}$/);
    expect(JSON.parse(value)).toEqual({ userId: "u1", newEmail: "new@example.com" });
    expect(ttl).toBe(1800);
    expect(sendConfirm).toHaveBeenCalledWith("new@example.com", expect.any(String), expect.stringContaining(key.slice("change-email:".length)));
  });

  it("requires the step-up check", async () => {
    stepUpOk = false;
    expect((await post({ newEmail: "new@example.com", password: "wrong" })).status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sendConfirm).not.toHaveBeenCalled();
  });

  it("refuses an address already on another account", async () => {
    taken = { id: "u2" };
    expect((await post({ newEmail: "taken@example.com", password: "pw" })).status).toBe(409);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("refuses the current address and invalid input", async () => {
    expect((await post({ newEmail: "old@example.com", password: "pw" })).status).toBe(400);
    expect((await post({ newEmail: "not-an-email", password: "pw" })).status).toBe(400);
  });

  it("reports a failed send instead of claiming success", async () => {
    sendConfirm.mockRejectedValueOnce(new Error("provider down"));
    expect((await post({ newEmail: "new@example.com", password: "pw" })).status).toBe(502);
  });
});
