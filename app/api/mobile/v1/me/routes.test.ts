import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// /me, /me/settings, /me/deactivate, /me/step-up-code wrap web routes; those
// are stand-ins here, so what's tested is auth, validation and the hand-off.

const webProfile = vi.fn();
const webPrefs = vi.fn();
const webDeactivate = vi.fn();
const webStepUp = vi.fn();
vi.mock("@/app/api/auth/profile/route", () => ({ PATCH: webProfile }));
vi.mock("@/app/api/notification-preferences/route", () => ({ PATCH: webPrefs }));
vi.mock("@/app/api/account/deactivate/route", () => ({ POST: webDeactivate }));
vi.mock("@/app/api/auth/step-up/send/route", () => ({ POST: webStepUp }));

let signedIn = true;
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => (signedIn ? { userId: "u1", email: "maya@creatorlab.co", sessionId: "s1" } : null)),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const buildAccount = vi.fn(async () => ({ user: { name: "Maya O." } }));
const buildSettings = vi.fn(async () => ({ language: "es", email: { weeklySummary: true, productUpdates: false } }));
vi.mock("@/lib/mobile/account", () => ({ buildAccount, buildSettings }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const me = await import("./route");
const settings = await import("./settings/route");
const deactivate = (await import("./deactivate/route")).POST;
const stepUp = (await import("./step-up-code/route")).POST;

const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/mobile/v1${path}`, {
    method,
    headers: { authorization: "Bearer acc", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ok = (body: unknown = { ok: true }, status = 200) => NextResponse.json(body, { status });
const sent = async (mock: ReturnType<typeof vi.fn>) => {
  const inner = mock.mock.calls[0]![0] as NextRequest;
  return { method: inner.method, auth: inner.headers.get("authorization"), body: await inner.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = true;
});

describe("/me", () => {
  it("needs a session", async () => {
    signedIn = false;
    const res = await me.GET(req("GET", "/me"));
    expect([res.status, (await res.json()).code]).toEqual([401, "unauthorized"]);
  });

  it("renames through the web's profile route, with the caller's token", async () => {
    webProfile.mockResolvedValue(ok());
    const res = await me.PATCH(req("PATCH", "/me", { name: "Maya O." }));
    expect(await res.json()).toEqual({ user: { name: "Maya O." } });
    expect(await sent(webProfile)).toEqual({ method: "PATCH", auth: "Bearer acc", body: { name: "Maya O." } });
  });

  it("passes the web's name error through", async () => {
    webProfile.mockResolvedValue(ok({ error: "Enter your name" }, 400));
    const res = await me.PATCH(req("PATCH", "/me", { name: " " }));
    expect([res.status, (await res.json()).error]).toEqual([400, "Enter your name"]);
  });
});

describe("/me/settings", () => {
  it("saves language on the profile and emails on the preferences", async () => {
    webProfile.mockResolvedValue(ok());
    webPrefs.mockResolvedValue(ok());
    const res = await settings.PATCH(req("PATCH", "/me/settings", { language: "es", email: { productUpdates: false } }));
    expect(await res.json()).toEqual({ language: "es", email: { weeklySummary: true, productUpdates: false } });
    expect((await sent(webProfile)).body).toEqual({ preferredLanguage: "es" });
    expect((await sent(webPrefs)).body).toEqual({ productUpdates: false });
  });

  it("refuses a language the app doesn't offer, without touching the web", async () => {
    const res = await settings.PATCH(req("PATCH", "/me/settings", { language: "xx" }));
    expect(res.status).toBe(400);
    expect(webProfile).not.toHaveBeenCalled();
  });
});

describe("/me/deactivate", () => {
  it("needs a password or a code", async () => {
    expect((await deactivate(req("POST", "/me/deactivate", {}))).status).toBe(400);
    expect(webDeactivate).not.toHaveBeenCalled();
  });

  it("hands the password to the web route and returns the purge date", async () => {
    webDeactivate.mockResolvedValue(ok({ ok: true, purgeAt: "2026-11-05T00:00:00.000Z" }));
    const res = await deactivate(req("POST", "/me/deactivate", { password: "pw" }));
    expect(await res.json()).toEqual({ ok: true, purgeAt: "2026-11-05T00:00:00.000Z" });
    expect((await sent(webDeactivate)).body).toEqual({ password: "pw" });
    webDeactivate.mockResolvedValue(ok({ error: "Incorrect password" }, 400));
    expect((await (await deactivate(req("POST", "/me/deactivate", { password: "bad" }))).json()).error).toBe("Incorrect password");
  });

  it("emails a step-up code for passwordless accounts", async () => {
    webStepUp.mockResolvedValue(ok({ ok: true }));
    expect(await (await stepUp(req("POST", "/me/step-up-code", {}))).json()).toEqual({ ok: true });
  });
});
