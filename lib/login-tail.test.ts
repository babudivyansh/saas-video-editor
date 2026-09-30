import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// finishLogin is the tail of EVERY sign-in that can reach an admin account —
// password, 2FA, email code, reactivation and "Continue with Google" all end
// here — so admin.signed_in recorded here covers all of them.

let role = "ADMIN";
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ role })) },
    loginEvent: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/auth", () => ({
  completeLogin: vi.fn(async () => ({ token: "jwt", sessionId: "sess-7", device: "Chrome on Windows", ip: "198.51.100.4" })),
  updateSessionCountry: vi.fn(async () => {}),
}));
vi.mock("@/lib/email", () => ({ sendNewLoginAlertEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const events: Array<Record<string, unknown>> = [];
vi.mock("@/lib/admin/audit", () => ({ auditEvent: vi.fn(async (e: Record<string, unknown>) => { events.push(e); }) }));

const { finishLogin } = await import("./login-tail");
const flush = () => new Promise((r) => setTimeout(r, 20));
const req = () => new NextRequest("http://x/api/auth/callback/google", { headers: { "user-agent": "Mozilla/5.0 Chrome" } });

beforeEach(() => {
  events.length = 0;
  role = "ADMIN";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
});

describe("finishLogin — admin sign-in auditing", () => {
  it("records admin.signed_in with the new session, IP and device for an admin", async () => {
    await finishLogin(req(), { id: "admin-1", email: "boss@clipiro.test", name: "Boss" }, "127.0.0.1");
    await flush();
    expect(events).toEqual([
      expect.objectContaining({
        actorId: "admin-1",
        actorType: "admin",
        action: "admin.signed_in",
        sessionId: "sess-7",
        userAgent: "Mozilla/5.0 Chrome",
        ip: "127.0.0.1",
        after: { device: "Chrome on Windows" },
      }),
    ]);
  });

  it("records nothing for an ordinary user's sign-in", async () => {
    role = "USER";
    await finishLogin(req(), { id: "u1", email: "pat@example.com", name: null }, "127.0.0.1");
    await flush();
    expect(events).toEqual([]);
  });
});
