import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Admin step-up: every outcome — code sent, wrong/expired code, rate limited,
// success — must land in the audit log with who/where, because a run of
// failures is exactly what someone trying to get into an admin session looks like.

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "boss@clipiro.test", sessionId: "sess-1" })),
}));
let allowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed })),
  getClientIp: () => "203.0.113.9",
}));
let verifyResult: { ok: true } | { ok: false; reason: "wrong" | "expired" | "too_many_attempts" } = { ok: true };
vi.mock("@/lib/admin/elevation", () => ({
  createElevationOtp: vi.fn(async () => "123456"),
  isElevated: vi.fn(async () => false),
  verifyElevationOtp: vi.fn(async () => verifyResult),
  ELEVATION_HOURS: 8,
}));
vi.mock("@/lib/email", () => ({ sendOtpEmail: vi.fn(async () => "email") }));
const events: Array<Record<string, unknown>> = [];
vi.mock("@/lib/admin/audit", () => ({
  auditEvent: vi.fn(async (e: Record<string, unknown>) => { events.push(e); }),
  auditIp: () => "203.0.113.9",
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://x/api/admin/elevate", { method: "POST", body: JSON.stringify(body), headers: { "user-agent": "Mozilla/5.0 Chrome" } }));

beforeEach(() => {
  events.length = 0;
  allowed = true;
  verifyResult = { ok: true };
});

describe("POST /api/admin/elevate — audited", () => {
  it("records a wrong code as admin.elevation_failed with the reason, IP, device and session", async () => {
    verifyResult = { ok: false, reason: "wrong" };
    const res = await post({ action: "verify", code: "000000" });
    expect(res.status).toBe(401);
    expect(events).toEqual([
      expect.objectContaining({
        actorId: "admin-1",
        actorType: "admin",
        action: "admin.elevation_failed",
        reason: "Wrong code — check your email and try again.",
        ip: "203.0.113.9",
        userAgent: "Mozilla/5.0 Chrome",
        sessionId: "sess-1",
        after: { step: "verify", result: "wrong" },
      }),
    ]);
  });

  it("records being rate-limited as a failure too", async () => {
    allowed = false;
    expect((await post({ action: "verify", code: "000000" })).status).toBe(429);
    expect(events[0]).toMatchObject({ action: "admin.elevation_failed", after: { step: "verify" } });
  });

  it("records a code request and a successful unlock", async () => {
    await post({ action: "send" });
    await post({ action: "verify", code: "123456" });
    expect(events.map((e) => e.action)).toEqual(["admin.elevation_code_sent", "admin.elevated"]);
  });

  it("does not log a malformed code (nothing was attempted)", async () => {
    expect((await post({ action: "verify", code: "12" })).status).toBe(400);
    expect(events).toEqual([]);
  });
});
