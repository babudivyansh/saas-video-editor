import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Connecting and disconnecting from the phone: the web's own routes (stand-ins
// here), asked to send the browser back into the app.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(async () => ({ userId: "u1" })),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const web = { connect: vi.fn(), disconnect: vi.fn() };
vi.mock("@/app/api/social/connect/[provider]/route", () => ({ GET: web.connect }));
vi.mock("@/app/api/social/accounts/[id]/route", () => ({ DELETE: web.disconnect }));
vi.mock("@/lib/social/providers", () => ({ availableProviders: () => ["youtube", "instagram", "tiktok"] }));
vi.mock("@/lib/mobile/social", () => ({ listAccounts: vi.fn(async () => []) }));

const connect = (await import("./connect/[provider]/route")).GET;
const disconnect = (await import("./accounts/[id]/route")).DELETE;
const accounts = (await import("./accounts/route")).GET;

const req = (url: string, method = "GET") => new NextRequest(`http://localhost/api/mobile/v1/social${url}`, { method, headers: { authorization: "Bearer acc" } });

beforeEach(() => vi.clearAllMocks());

describe("connect from the phone", () => {
  it("asks the web's connect for an app sign-in", async () => {
    web.connect.mockResolvedValue(NextResponse.json({ url: "https://accounts.google.com/o/oauth2/auth?state=s" }));
    const res = await connect(req("/connect/youtube"), { params: Promise.resolve({ provider: "youtube" }) });
    expect(await res.json()).toEqual({ url: "https://accounts.google.com/o/oauth2/auth?state=s" });
    const inner = web.connect.mock.calls[0]![0] as NextRequest;
    expect(inner.nextUrl.searchParams.get("client")).toBe("app");
    expect(await (web.connect.mock.calls[0]![1] as { params: Promise<unknown> }).params).toEqual({ provider: "youtube" });
  });

  it("says when it's for paid plans", async () => {
    web.connect.mockResolvedValue(NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 }));
    const res = await connect(req("/connect/youtube"), { params: Promise.resolve({ provider: "youtube" }) });
    expect([res.status, (await res.json()).code]).toEqual([402, "subscription_required"]);
  });

  it("lists only the app's platforms that are set up, and disconnects", async () => {
    expect(await (await accounts(req("/accounts"))).json()).toEqual({ accounts: [], connectable: ["youtube", "instagram"] });
    web.disconnect.mockResolvedValue(NextResponse.json({ success: true }));
    expect(await (await disconnect(req("/accounts/a1", "DELETE"), { params: Promise.resolve({ id: "a1" }) })).json()).toEqual({ ok: true });
  });
});
