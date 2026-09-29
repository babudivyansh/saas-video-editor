// POST /api/auth/forgot-password — must never reveal whether an account
// exists (same answer, same minimum delay), must hand out a single stored
// token with a 15-minute life, and must be rate limited.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let allowed = true;
let user: { id: string; email: string; name: string | null } | null = null;
const redisSet = vi.hoisted(() => vi.fn(async () => {}));
const sendPasswordResetEmail = vi.hoisted(() => vi.fn(async () => {}));
const atLeast = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => user) } } }));
vi.mock("@/lib/redis", () => ({ redis: { set: redisSet } }));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed })), getClientIp: () => "1.2.3.4" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://clipiro.test" } }));
vi.mock("@/lib/min-duration", () => ({ atLeast }));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  allowed = true;
  user = null;
});

describe("POST /api/auth/forgot-password", () => {
  it("answers the same for an unknown address — no enumeration — and still waits out the floor", async () => {
    const res = await post({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(atLeast).toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("stores a 15-minute token for the user and emails a link carrying it", async () => {
    user = { id: "u1", email: "a@example.com", name: "Ada" };
    const res = await post({ email: " A@Example.com " });
    expect(await res.json()).toEqual({ ok: true });
    const [key, value, ex, ttl] = redisSet.mock.calls[0] as unknown as [string, string, string, number];
    expect(key).toMatch(/^pwd-reset:[0-9a-f]{64}$/);
    expect([value, ex, ttl]).toEqual(["u1", "EX", 900]);
    const link = (sendPasswordResetEmail.mock.calls[0] as unknown as [string, string, string])[2];
    expect(link).toBe(`https://clipiro.test/reset-password?token=${key.slice("pwd-reset:".length)}`);
  });

  it("still answers ok if the email provider fails (and doesn't leak that it tried)", async () => {
    user = { id: "u1", email: "a@example.com", name: null };
    sendPasswordResetEmail.mockRejectedValueOnce(new Error("smtp down"));
    expect(await (await post({ email: "a@example.com" })).json()).toEqual({ ok: true });
  });

  it("is rate limited", async () => {
    allowed = false;
    expect((await post({ email: "a@example.com" })).status).toBe(429);
  });

  it("requires an email", async () => {
    expect((await post({})).status).toBe(400);
  });
});
