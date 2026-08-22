import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://clipiro.com", GOOGLE_CLIENT_ID: "test-client-id" },
}));

const { GET } = await import("./route");

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/auth/google (OAuth initiation)", () => {
  it("encodes a safe next path into the state param and the state cookie", async () => {
    const res = await GET(makeRequest("https://clipiro.com/api/auth/google?next=%2Fdashboard%2Feditor%3FprojectId%3Dabc"));
    const location = res.headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    expect(state).toContain(".");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`google_oauth_state=${state}`);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("redirects to Google's real OAuth endpoint with the configured client id", async () => {
    const res = await GET(makeRequest("https://clipiro.com/api/auth/google"));
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(new URL(location).searchParams.get("client_id")).toBe("test-client-id");
  });

  it("never encodes an external next value into the state sent to Google", async () => {
    const res = await GET(makeRequest("https://clipiro.com/api/auth/google?next=" + encodeURIComponent("https://evil.com")));
    const location = res.headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    expect(state).not.toContain("."); // bare nonce only — nothing unsafe encoded
  });

  it("works with no next param at all (plain nonce state)", async () => {
    const res = await GET(makeRequest("https://clipiro.com/api/auth/google"));
    const location = res.headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    expect(state).not.toContain(".");
    expect(state.length).toBe(32); // 16 random bytes as hex
  });
});
