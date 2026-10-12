import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let signedIn = true;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => (signedIn ? { userId: "u1", email: "m@x.co", sessionId: "s1" } : null)), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { deviceToken: { upsert, deleteMany } } }));

const { POST, DELETE } = await import("./route");

const TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";
const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/devices", { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = true;
});

describe("devices", () => {
  it("registers a phone for this user and session, moving a token another account had", async () => {
    const res = await POST(req("POST", { token: TOKEN, provider: "expo", deviceName: "Pixel 7", appVersion: "1.0.0" }));
    expect(await res.json()).toEqual({ ok: true });
    const call = upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ token: TOKEN });
    expect(call.update).toMatchObject({ userId: "u1", sessionId: "s1", provider: "expo", deviceName: "Pixel 7" });
    expect(call.create).toMatchObject({ token: TOKEN, userId: "u1", sessionId: "s1" });
  });

  it("refuses a bad token or provider, and anyone signed out", async () => {
    expect((await POST(req("POST", { token: "short", provider: "expo" }))).status).toBe(400);
    expect((await POST(req("POST", { token: TOKEN, provider: "apns" }))).status).toBe(400);
    signedIn = false;
    expect((await POST(req("POST", { token: TOKEN, provider: "expo" }))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("unregisters only the caller's own token", async () => {
    await DELETE(req("DELETE", { token: TOKEN }));
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: TOKEN, userId: "u1" } });
  });
});
