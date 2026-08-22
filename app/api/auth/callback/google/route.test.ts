// Focused regression coverage for the P0-4 Google OAuth gap: a successful
// sign-in must redirect to the `next` destination encoded in the state
// param (via lib/oauth-state.ts), not the previously-hardcoded "/dashboard".
// Google's token/profile endpoints are mocked — this is not testing the
// OAuth exchange itself, only where the route sends the user afterward.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeOAuthState } from "@/lib/oauth-state";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://clipiro.com",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })), getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/affiliate", () => ({ attributeReferral: vi.fn(async () => {}) }));
vi.mock("@/lib/marketing-analytics", () => ({ recordSignupAttribution: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/two-factor-ticket", () => ({ mintTwoFactorTicket: vi.fn(async () => "ticket-123") }));
vi.mock("@/lib/auth", () => ({
  completeLogin: vi.fn(async () => ({ token: "signed.jwt.token", sessionId: "s1", device: "test", ip: null })),
  setSessionCookie: vi.fn(),
}));

const existingUser = {
  id: "user-1",
  email: "test@example.com",
  avatarUrl: "https://existing.example/avatar.png",
  emailVerifiedAt: new Date(),
  suspendedAt: null,
  deactivatedAt: null,
  twoFactorEnabled: false,
};
let userToReturn: typeof existingUser | null = existingUser;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => userToReturn),
      update: vi.fn(async (args: { data: object }) => ({ ...existingUser, ...args.data })),
      create: vi.fn(),
    },
  },
}));

const { GET } = await import("./route");

const STATE_COOKIE_NAME = "google_oauth_state";

function makeRequest(state: string, next: string | null) {
  const encoded = encodeOAuthState(state === "RAW" ? "nonce" : state, next);
  const url = `https://clipiro.com/api/auth/callback/google?code=auth-code-123&state=${encodeURIComponent(encoded)}`;
  const req = new NextRequest(url);
  req.cookies.set(STATE_COOKIE_NAME, encoded);
  return req;
}

beforeEach(() => {
  userToReturn = existingUser;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return { ok: true, json: async () => ({ access_token: "fake-access-token" }) };
      }
      if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
        return { ok: true, json: async () => ({ email: "test@example.com", name: "Test User", email_verified: true }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("GET /api/auth/callback/google — post-login destination", () => {
  it("redirects to the next destination encoded in state for an existing user", async () => {
    const req = makeRequest("RAW", "/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3");
    const res = await GET(req);
    const html = await res.text();
    expect(html).toContain('"/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3"');
    expect(html).not.toContain('"/dashboard";'); // the old hardcoded literal is gone
  });

  it("falls back to /dashboard when no next was encoded", async () => {
    const req = makeRequest("RAW", null);
    const res = await GET(req);
    const html = await res.text();
    expect(html).toContain('"/dashboard"');
  });

  it("routes a 2FA-enabled user to /login with both the ticket and next preserved", async () => {
    userToReturn = { ...existingUser, twoFactorEnabled: true };
    const req = makeRequest("RAW", "/dashboard?billing=1");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("2fa=ticket-123");
    expect(location).toContain(encodeURIComponent("/dashboard?billing=1"));
  });

  it("never embeds an unsafe next value — a forged state cannot inject an external redirect", async () => {
    // Simulate a state that decodes to something unsafe (would only reach
    // here if it also matched the CSRF cookie, but decodeNextFromState's own
    // re-validation is the last line of defense either way).
    const forged = "nonce." + Buffer.from("https://evil.com", "utf8").toString("base64url");
    const req = new NextRequest(
      `https://clipiro.com/api/auth/callback/google?code=auth-code-123&state=${encodeURIComponent(forged)}`,
    );
    req.cookies.set(STATE_COOKIE_NAME, forged);
    const res = await GET(req);
    const html = await res.text();
    expect(html).not.toContain("evil.com");
    expect(html).toContain('"/dashboard"'); // safely fell back
  });
});
