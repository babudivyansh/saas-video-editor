// P0-4 regression coverage: an unauthenticated hit on a protected page must
// preserve a safe "next" destination through the /login redirect, and must
// never honor an unsafe (external/protocol-relative) one. Only the redirect
// branch is exercised here — rate limiting, maintenance mode, and the
// affiliate/attribution cookie logic (all in unrelated branches of proxy())
// are out of scope for this test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let sessionValid = false;
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "session",
  verifyToken: vi.fn(() => {
    if (!sessionValid) throw new Error("invalid token");
    return { userId: "u1" };
  }),
}));

vi.mock("@/lib/api-public-routes", () => ({ isPublicApiRoute: () => false }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/marketing-attribution", () => ({
  ATTRIBUTION_COOKIE: "clipiro_attr",
  buildAttributionCookie: () => null,
}));
vi.mock("@/lib/csp", () => ({ buildCsp: () => "default-src 'self'" }));
vi.mock("@/lib/flags", () => ({ getMaintenanceModeCached: async () => ({ on: false }) }));

const { proxy } = await import("./proxy");

function makeRequest(url: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `session=${cookie}`);
  return new NextRequest(url, { headers });
}

describe("proxy() — protected-page auth redirect", () => {
  beforeEach(() => {
    sessionValid = false;
  });

  it("preserves an editor deep link's projectId through the login redirect", async () => {
    const req = makeRequest("https://clipiro.com/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain(encodeURIComponent("/dashboard/editor?projectId=31080d99-b658-4387-b488-5c9c531592e3"));
  });

  it("preserves a billing deep link through the login redirect", async () => {
    const req = makeRequest("https://clipiro.com/dashboard?billing=1");
    const res = await proxy(req);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain(encodeURIComponent("/dashboard?billing=1"));
  });

  it("preserves the existing marketing-page detour for a bare tool path with no query string (unrelated UX feature, must not regress)", async () => {
    const req = makeRequest("https://clipiro.com/dashboard/editor");
    const res = await proxy(req);
    const location = res.headers.get("location")!;
    expect(location).toContain("/tools/video-editor");
    expect(location).not.toContain("/login");
  });

  it("a bare non-tool gated path (e.g. /dashboard root) falls through to /login, next pointing back at itself", async () => {
    const req = makeRequest("https://clipiro.com/dashboard");
    const res = await proxy(req);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain(encodeURIComponent("/dashboard"));
  });

  it("does not redirect at all once authenticated", async () => {
    sessionValid = true;
    const req = makeRequest("https://clipiro.com/dashboard/editor?projectId=abc", "valid-token");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });

  it("never forwards a malicious external next value as a real redirect target's next param", async () => {
    // Even if something upstream tried to smuggle one in as part of the path,
    // the ONLY next value proxy.ts ever builds itself is the current
    // same-origin pathname+search — but assert the invariant directly via the
    // shared validator it uses, since that's the actual security boundary.
    const { getSafeNextPath } = await import("@/lib/safe-redirect");
    expect(getSafeNextPath("https://evil.com/phish")).toBeNull();
    expect(getSafeNextPath("//evil.com")).toBeNull();
  });
});

describe("proxy() — API auth gate", () => {
  beforeEach(() => {
    sessionValid = true;
  });
  const bearer = (url: string, token = "jwt") => new NextRequest(url, { headers: { authorization: `Bearer ${token}` } });

  it("lets an API call through on a Bearer token alone (the Android app has no cookie)", async () => {
    expect((await proxy(bearer("https://clipiro.com/api/mobile/v1/me"))).status).toBe(200);
  });

  it("still 401s an API call with neither cookie nor a valid Bearer", async () => {
    expect((await proxy(makeRequest("https://clipiro.com/api/projects"))).status).toBe(401);
    sessionValid = false;
    expect((await proxy(bearer("https://clipiro.com/api/projects", "forged"))).status).toBe(401);
  });

  it("doesn't let a Bearer header open a page (pages read only the cookie)", async () => {
    const res = await proxy(bearer("https://clipiro.com/dashboard"));
    expect(res.status).toBe(307);
  });
});

describe("proxy() — CSP", () => {
  it("sends the enforcing header, not Report-Only, on pages, redirects and API responses", async () => {
    for (const res of [
      await proxy(makeRequest("https://clipiro.com/pricing")),
      await proxy(makeRequest("https://clipiro.com/dashboard")),
      await proxy(makeRequest("https://clipiro.com/api/projects")),
    ]) {
      expect(res.headers.get("content-security-policy")).toBe("default-src 'self'");
      expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    }
  });
});

describe("proxy() — admin console on its own host (ADMIN_ORIGIN)", () => {
  const ADMIN = "https://admin.clipiro.com";
  beforeEach(() => {
    sessionValid = false;
    process.env.ADMIN_ORIGIN = ADMIN;
    process.env.NEXT_PUBLIC_APP_URL = "https://clipiro.com";
  });
  afterEach(() => {
    delete process.env.ADMIN_ORIGIN;
  });

  it("sends main-site /admin pages to the admin host, path and query intact", async () => {
    const res = await proxy(makeRequest("https://clipiro.com/admin/users?q=ann"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${ADMIN}/admin/users?q=ann`);
  });

  it("refuses /api/admin on the main site, even with a valid session", async () => {
    sessionValid = true;
    const res = await proxy(makeRequest("https://clipiro.com/api/admin/users", "valid-token"));
    expect(res.status).toBe(404);
  });

  it("serves /api/admin on the admin host", async () => {
    sessionValid = true;
    const res = await proxy(makeRequest(`${ADMIN}/api/admin/users`, "valid-token"));
    expect(res.status).toBe(200);
  });

  it("opens the console from the subdomain root", async () => {
    sessionValid = true;
    const res = await proxy(makeRequest(`${ADMIN}/`, "valid-token"));
    expect(res.headers.get("location")).toBe(`${ADMIN}/admin`);
  });

  it("sends a signed-out visitor to the admin host's own /login, keeping where they were going", async () => {
    const res = await proxy(makeRequest(`${ADMIN}/admin/ops`));
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ADMIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin/ops");
  });

  it("serves /login on the admin host, noindex, and lands a signed-in admin on /admin", async () => {
    const signedOut = await proxy(makeRequest(`${ADMIN}/login?next=%2Fadmin`));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    sessionValid = true;
    expect((await proxy(makeRequest(`${ADMIN}/login`, "valid-token"))).headers.get("location")).toBe(`${ADMIN}/admin`);
    expect((await proxy(makeRequest(`${ADMIN}/dashboard`, "valid-token"))).headers.get("location")).toBe(`${ADMIN}/admin`);
  });

  it("hands every other page on the admin host back to the main site", async () => {
    const res = await proxy(makeRequest(`${ADMIN}/pricing?plan=pro`));
    expect(res.headers.get("location")).toBe("https://clipiro.com/pricing?plan=pro");
  });

  it("still serves public files on the admin host", async () => {
    expect((await proxy(makeRequest(`${ADMIN}/robots.txt`))).status).toBe(200);
  });

  it("changes nothing when ADMIN_ORIGIN is unset", async () => {
    delete process.env.ADMIN_ORIGIN;
    sessionValid = true;
    expect((await proxy(makeRequest("https://clipiro.com/admin/users", "valid-token"))).status).toBe(200);
    expect((await proxy(makeRequest("https://clipiro.com/api/admin/users", "valid-token"))).status).toBe(200);
  });
});
