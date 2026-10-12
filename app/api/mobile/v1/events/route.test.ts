import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The app's first-party analytics: a known event and a version string are
// counted per day, and nothing about the caller is stored.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), requireSubscriber: vi.fn(), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const upsert = vi.fn(async (_a: unknown) => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { appEventDaily: { upsert } } }));

const { POST } = await import("./route");
const req = (body: unknown) => new NextRequest("http://localhost/api/mobile/v1/events", { method: "POST", headers: { authorization: "Bearer a" }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe("POST /events", () => {
  it("counts the event for today and this version, with no user in it", async () => {
    const res = await POST(req({ event: "autoclip_started", appVersion: "1.0.0" }));
    expect(await res.json()).toEqual({ ok: true });
    const call = upsert.mock.calls[0]![0] as { where: { date_event_appVersion: Record<string, string> }; create: Record<string, unknown> };
    expect(call.where.date_event_appVersion).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), event: "autoclip_started", appVersion: "1.0.0" });
    expect(JSON.stringify(call)).not.toContain("u1");
  });

  it("refuses unknown events and free-form versions", async () => {
    expect((await POST(req({ event: "anything", appVersion: "1.0.0" }))).status).toBe(400);
    expect((await POST(req({ event: "app_open", appVersion: "1.0.0; drop table" }))).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("never fails because counting did", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(req({ event: "app_open", appVersion: "1.0.0" }))).status).toBe(200);
  });
});
