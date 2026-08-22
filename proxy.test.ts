// P0-4 regression coverage: an unauthenticated hit on a protected page must
// preserve a safe "next" destination through the /login redirect, and must
// never honor an unsafe (external/protocol-relative) one. Only the redirect
// branch is exercised here — rate limiting, maintenance mode, and the
// affiliate/attribution cookie logic (all in unrelated branches of proxy())
// are out of scope for this test.

import { beforeEach, describe, expect, it, vi } from "vitest";
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
