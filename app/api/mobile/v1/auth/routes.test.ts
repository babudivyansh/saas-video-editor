import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mobileLoginResponse, mobileSessionSchema, signupPendingResponse } from "@clipiro/shared";

// The mobile auth routes wrap the web ones. Here the web handlers are
// stand-ins, so what's under test is the wrapping: validation with the shared
// schemas, a { token } answer becoming access + refresh tokens, cookies and
// the web's own fields dropped, everything else passed through.

const webLogin = vi.fn();
const webRegister = vi.fn();
const webSendOtp = vi.fn();
vi.mock("@/app/api/auth/login/route", () => ({ POST: webLogin }));
vi.mock("@/app/api/auth/register/route", () => ({ POST: webRegister }));
vi.mock("@/app/api/auth/send-otp/route", () => ({ POST: webSendOtp }));

const convertToMobileSession = vi.fn();
const refreshMobileSession = vi.fn();
const revokeMobileSession = vi.fn();
const getAuthUser = vi.fn();
const invalidateOneSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  convertToMobileSession,
  refreshMobileSession,
  revokeMobileSession,
  getAuthUser,
  invalidateOneSession,
  verifyToken: () => ({ userId: "u1", email: "maya@creatorlab.co", sessionId: "s1" }),
}));
const deviceDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "u1", email: "maya@creatorlab.co", name: "Maya Okafor", avatarUrl: null })) },
    deviceToken: { deleteMany: deviceDeleteMany },
  },
}));
const rateLimit = vi.fn(async () => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit, getClientIp: () => "203.0.113.9" }));

const verifyGoogleIdToken = vi.fn();
const signInWithGoogleProfile = vi.fn();
class GoogleTokenError extends Error {}
vi.mock("@/lib/google-account", () => ({ verifyGoogleIdToken, signInWithGoogleProfile, GoogleTokenError }));
const finishLogin = vi.fn(async () => "web-token");
vi.mock("@/lib/login-tail", () => ({ finishLogin }));
vi.mock("@/lib/two-factor-ticket", () => ({ mintTwoFactorTicket: vi.fn(async () => "ticket-1") }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/env", () => ({ env: { GOOGLE_CLIENT_ID: "web-client", GOOGLE_ANDROID_CLIENT_ID: undefined } }));

const login = (await import("./login/route")).POST;
const signup = (await import("./signup/route")).POST;
const resend = (await import("./login/resend/route")).POST;
const google = (await import("./google/route")).POST;
const refresh = (await import("./refresh/route")).POST;
const logout = (await import("./logout/route")).POST;

const TOKENS = { accessToken: "acc", refreshToken: "u1.s1.secret", expiresIn: 3600 };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/mobile/v1/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Clipiro/1.0 (Android 15)", cookie: "session=browser", ...headers },
    body: JSON.stringify(body),
  });
const webAnswer = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status });
  res.cookies.set("session", "web-token");
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  convertToMobileSession.mockResolvedValue(TOKENS);
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("login", () => {
  it("turns the web's { token } into a mobile session with no cookie", async () => {
    webLogin.mockResolvedValue(webAnswer({ token: "web-token", user: { id: "u1", email: "maya@creatorlab.co", credits: 10 } }));
    const res = await login(post("/login", { email: "Maya@CreatorLab.co", password: "clipiro2026" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = mobileSessionSchema.strict().parse(await res.json());
    expect(body.user).toEqual({ id: "u1", email: "maya@creatorlab.co", name: "Maya Okafor", avatarUrl: null });
    expect(convertToMobileSession).toHaveBeenCalledWith("web-token");
  });

  it("hands the web the validated body and the device's headers, never its cookie", async () => {
    webLogin.mockResolvedValue(webAnswer({ requires2fa: true, ticket: "t" }));
    await login(post("/login", { email: " maya@creatorlab.co ", password: "pw" }));
    const inner = webLogin.mock.calls[0]![0] as NextRequest;
    expect(await inner.json()).toEqual({ email: "maya@creatorlab.co", password: "pw" });
    expect(inner.headers.get("user-agent")).toBe("Clipiro/1.0 (Android 15)");
    expect(inner.headers.get("cookie")).toBeNull();
  });

  it("passes the 2FA and verify-email steps through", async () => {
    webLogin.mockResolvedValue(webAnswer({ requires2fa: true, ticket: "t" }));
    expect(mobileLoginResponse.parse(await (await login(post("/login", { email: "a@b.co", password: "x" }))).json())).toEqual({ requires2fa: true, ticket: "t" });
    webLogin.mockResolvedValue(webAnswer({ requiresEmailVerification: true, email: "a@b.co", passwordProof: "p" }));
    expect(await (await login(post("/login", { email: "a@b.co", password: "x" }))).json()).toEqual({ requiresEmailVerification: true, email: "a@b.co", passwordProof: "p" });
  });

  it("passes errors through with their status and flags", async () => {
    webLogin.mockResolvedValue(webAnswer({ error: "This account is deactivated.", deactivated: true }, 403));
    const res = await login(post("/login", { email: "a@b.co", password: "x" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "This account is deactivated.", deactivated: true });
  });

  it("rejects a bad form before the web route runs, with per-field messages", async () => {
    const res = await login(post("/login", { email: "not-an-email", password: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_request");
    expect(Object.keys(body.fields)).toEqual(["email", "password"]);
    expect(webLogin).not.toHaveBeenCalled();
  });
});

describe("signup and resend", () => {
  it("returns the pending signup as the web does", async () => {
    webRegister.mockResolvedValue(webAnswer({ pending: true, email: "a@b.co", signupToken: "st" }, 202));
    const res = await signup(post("/signup", { name: "Maya", email: "a@b.co", password: "clipiro2026", confirmPassword: "clipiro2026" }));
    expect(res.status).toBe(202);
    expect(signupPendingResponse.parse(await res.json()).signupToken).toBe("st");
  });

  it("answers { ok } where the web says { success }", async () => {
    webSendOtp.mockResolvedValue(webAnswer({ success: true }));
    expect(await (await resend(post("/login/resend", { email: "a@b.co" }))).json()).toEqual({ ok: true });
  });
});

describe("google", () => {
  it("verifies the ID token against our client ID and signs in", async () => {
    verifyGoogleIdToken.mockResolvedValue({ email: "maya@creatorlab.co", email_verified: true });
    signInWithGoogleProfile.mockResolvedValue({ kind: "signed-in", user: { id: "u1", email: "maya@creatorlab.co", name: "Maya", credits: 10 }, isNewUser: true });
    const res = await google(post("/google", { idToken: "id-token" }));
    expect(verifyGoogleIdToken).toHaveBeenCalledWith("id-token", ["web-client"]);
    expect(res.status).toBe(201);
    mobileSessionSchema.parse(await res.json());
  });

  it("refuses a bad token, and pauses for 2FA", async () => {
    verifyGoogleIdToken.mockRejectedValue(new GoogleTokenError("jwt expired"));
    const bad = await google(post("/google", { idToken: "x" }));
    expect([bad.status, (await bad.json()).code]).toEqual([401, "google_token_invalid"]);
    verifyGoogleIdToken.mockResolvedValue({ email: "a@b.co", email_verified: true });
    signInWithGoogleProfile.mockResolvedValue({ kind: "2fa", user: { id: "u1" } });
    expect(await (await google(post("/google", { idToken: "x" }))).json()).toEqual({ requires2fa: true, ticket: "ticket-1" });
    expect(finishLogin).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    rateLimit.mockResolvedValue({ allowed: false });
    expect((await google(post("/google", { idToken: "x" }))).status).toBe(429);
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });
});

describe("refresh and logout", () => {
  it("returns a new pair, or a 401 that says why", async () => {
    refreshMobileSession.mockResolvedValue({ ok: true, tokens: TOKENS });
    expect(await (await refresh(post("/refresh", { refreshToken: "u1.s1.old" }))).json()).toEqual(TOKENS);
    refreshMobileSession.mockResolvedValue({ ok: false, reason: "reused" });
    const res = await refresh(post("/refresh", { refreshToken: "u1.s1.old" }));
    expect([res.status, (await res.json()).code]).toEqual([401, "refresh_reused"]);
  });

  it("logs out by refresh token and by Bearer, and is always ok", async () => {
    revokeMobileSession.mockResolvedValue({ userId: "u1", sessionId: "s1" });
    getAuthUser.mockResolvedValue({ userId: "u1", sessionId: "s1" });
    const res = await logout(post("/logout", { refreshToken: "u1.s1.secret" }, { authorization: "Bearer acc" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeMobileSession).toHaveBeenCalledWith("u1.s1.secret");
    expect(invalidateOneSession).toHaveBeenCalledWith("u1", "s1");
    // That phone's push tokens go with the session.
    expect(deviceDeleteMany).toHaveBeenCalledWith({ where: { OR: [{ userId: "u1", sessionId: "s1" }, { userId: "u1", sessionId: "s1" }] } });
    getAuthUser.mockResolvedValue(null);
    deviceDeleteMany.mockClear();
    expect((await logout(post("/logout", {}))).status).toBe(200);
    expect(deviceDeleteMany).not.toHaveBeenCalled();
  });
});
