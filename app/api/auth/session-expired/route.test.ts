import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route pulls lib/auth for clearSessionCookie, which reaches lib/env at
// module scope. None of that participates in what is tested here.
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incrWithExpire: vi.fn() },
}));

const { GET } = await import("./route");

function call(query: string) {
  return GET(new NextRequest(`http://localhost:3000/api/auth/session-expired${query}`));
}

describe("GET /api/auth/session-expired", () => {
  it("clears the session cookie", async () => {
    const res = await call("");
    const cookie = res.cookies.get("session");

    // An expired empty value, scoped to the whole site — anything narrower
    // leaves the dead cookie in place on the paths that matter.
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/");
  });

  it("sends the visitor to the login form", async () => {
    const res = await call("");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("carries a safe ?next through so the visitor lands back where they were", async () => {
    const res = await call(`?next=${encodeURIComponent("/dashboard/social-tracker")}`);
    const location = new URL(res.headers.get("location")!);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard/social-tracker");
  });

  it("refuses to forward an off-site ?next", async () => {
    // This route is reachable without a session by design, so an unchecked
    // ?next would be an open redirect anyone could link to.
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      const res = await call(`?next=${encodeURIComponent(hostile)}`);
      const location = new URL(res.headers.get("location")!);

      expect(location.origin).toBe("http://localhost:3000");
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("next")).toBeNull();
    }
  });
});
