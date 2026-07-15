import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    META_APP_ID: "test-app-id",
    META_APP_SECRET: "test-app-secret",
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { refreshTokens, syncAccount } = await import("./meta");

type Route = { match: (url: string) => boolean; respond: () => { ok: boolean; status?: number; body: unknown } };
let routes: Route[];

function jsonResponse(spec: { ok: boolean; status?: number; body: unknown }) {
  return {
    ok: spec.ok,
    status: spec.status ?? (spec.ok ? 200 : 500),
    json: async () => spec.body,
    text: async () => JSON.stringify(spec.body),
  };
}

beforeEach(() => {
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const route = routes.find((r) => r.match(url));
      if (!route) throw new Error(`unexpected fetch in test: ${url}`);
      return jsonResponse(route.respond());
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGES_BODY = {
  data: [
    {
      id: "page-1",
      name: "My Page",
      access_token: "fresh-page-token",
      followers_count: 111,
      instagram_business_account: { id: "ig-1", username: "creator", followers_count: 222 },
    },
  ],
};

describe("refreshTokens", () => {
  it("rotates the user token and re-derives the Page token for the account", async () => {
    routes = [
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("fb_exchange_token=old-user-token"),
        respond: () => ({ ok: true, body: { access_token: "new-user-token", expires_in: 5_184_000 } }),
      },
      { match: (u) => u.includes("/me/accounts"), respond: () => ({ ok: true, body: PAGES_BODY }) },
    ];
    const tokens = await refreshTokens("old-user-token", "instagram", "ig-1");
    expect(tokens.accessToken).toBe("fresh-page-token");
    expect(tokens.refreshToken).toBe("new-user-token");
    expect(tokens.expiresAt).toBeInstanceOf(Date);
    expect(tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("treats a missing expires_in as long-lived (no expiry)", async () => {
    routes = [
      { match: (u) => u.includes("/oauth/access_token"), respond: () => ({ ok: true, body: { access_token: "new-user-token" } }) },
      { match: (u) => u.includes("/me/accounts"), respond: () => ({ ok: true, body: PAGES_BODY }) },
    ];
    const tokens = await refreshTokens("old-user-token", "facebook", "page-1");
    expect(tokens.accessToken).toBe("fresh-page-token");
    expect(tokens.expiresAt).toBeUndefined();
  });

  it("throws when the account is no longer granted to the app", async () => {
    routes = [
      { match: (u) => u.includes("/oauth/access_token"), respond: () => ({ ok: true, body: { access_token: "new-user-token" } }) },
      { match: (u) => u.includes("/me/accounts"), respond: () => ({ ok: true, body: { data: [] } }) },
    ];
    await expect(refreshTokens("old-user-token", "instagram", "ig-1")).rejects.toThrow(/no longer granted/);
  });

  it("throws when the token exchange itself fails", async () => {
    routes = [{ match: (u) => u.includes("/oauth/access_token"), respond: () => ({ ok: false, status: 401, body: { error: "expired" } }) }];
    await expect(refreshTokens("dead-token", "instagram", "ig-1")).rejects.toThrow(/meta token refresh failed: 401/);
  });
});

describe("syncAccount partial failures", () => {
  it("returns profile data with partialError when the media fetch fails", async () => {
    routes = [
      {
        match: (u) => u.includes("/ig-1?fields=username"),
        respond: () => ({ ok: true, body: { username: "creator", followers_count: 222 } }),
      },
      { match: (u) => u.includes("/ig-1/media"), respond: () => ({ ok: false, status: 400, body: { error: "insights denied" } }) },
    ];
    const sync = await syncAccount("ig-1", "instagram", "page-token");
    expect(sync.account.metrics.followers).toBe(222);
    expect(sync.posts).toEqual([]);
    expect(sync.partialError).toMatch(/Instagram media could not be fetched/);
  });

  it("reports no partialError on a clean sync", async () => {
    routes = [
      { match: (u) => u.includes("/ig-1?fields=username"), respond: () => ({ ok: true, body: { username: "creator", followers_count: 222 } }) },
      { match: (u) => u.includes("/ig-1/media"), respond: () => ({ ok: true, body: { data: [] } }) },
    ];
    const sync = await syncAccount("ig-1", "instagram", "page-token");
    expect(sync.partialError).toBeUndefined();
  });
});
