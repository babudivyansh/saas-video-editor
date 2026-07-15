import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    TIKTOK_CLIENT_KEY: "test-key",
    TIKTOK_CLIENT_SECRET: "test-secret",
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { refreshTokens, sync } = await import("./tiktok");

type FetchSpec = { match: (url: string) => boolean; body: unknown; ok?: boolean; status?: number };
let routes: FetchSpec[];

beforeEach(() => {
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const r = routes.find((s) => s.match(url));
      if (!r) throw new Error(`unexpected fetch in test: ${url}`);
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.body,
        text: async () => JSON.stringify(r.body),
      };
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("refreshTokens", () => {
  it("returns rotated access + refresh tokens with expiry", async () => {
    routes = [
      {
        match: (u) => u.includes("/oauth/token/"),
        body: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 86400, open_id: "u1" },
      },
    ];
    const t = await refreshTokens("old-refresh");
    expect(t.accessToken).toBe("new-access");
    expect(t.refreshToken).toBe("new-refresh");
    expect(t.expiresAt).toBeInstanceOf(Date);
  });

  it("treats TikTok's 200-with-error-body responses as auth failures", async () => {
    routes = [{ match: (u) => u.includes("/oauth/token/"), body: { error: "invalid_grant", error_description: "expired" } }];
    await expect(refreshTokens("dead")).rejects.toMatchObject({ status: 401 });
  });
});

describe("sync", () => {
  it("normalizes profile + videos", async () => {
    routes = [
      {
        match: (u) => u.includes("/user/info/"),
        body: { data: { user: { open_id: "u1", username: "creator", display_name: "Creator", follower_count: 500 } } },
      },
      {
        match: (u) => u.includes("/video/list/"),
        body: {
          data: {
            videos: [
              {
                id: "7300000001",
                title: "First video",
                share_url: "https://www.tiktok.com/@creator/video/7300000001",
                view_count: 1000,
                like_count: 100,
                comment_count: 10,
                share_count: 5,
                create_time: 1_752_000_000,
              },
            ],
            has_more: false,
          },
        },
      },
    ];
    const s = await sync("token");
    expect(s.account.provider).toBe("tiktok");
    expect(s.account.metrics.followers).toBe(500);
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]).toMatchObject({ providerPostId: "7300000001", views: 1000, shares: 5, mediaType: "video" });
    expect(s.partialError).toBeUndefined();
  });

  it("reports partialError when the video list fails but keeps profile stats", async () => {
    routes = [
      { match: (u) => u.includes("/user/info/"), body: { data: { user: { open_id: "u1", follower_count: 500 } } } },
      { match: (u) => u.includes("/video/list/"), body: { error: "rate" }, ok: false, status: 429 },
    ];
    const s = await sync("token");
    expect(s.account.metrics.followers).toBe(500);
    expect(s.posts).toEqual([]);
    expect(s.partialError).toMatch(/TikTok videos/);
  });
});
