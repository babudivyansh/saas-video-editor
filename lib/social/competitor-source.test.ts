import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000", SCRAPECREATORS_API_KEY: "k" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { normalizeProfile, normalizePosts } = await import("./competitor-source");

describe("normalizeProfile", () => {
  it("plucks Instagram-shaped payloads", () => {
    const p = normalizeProfile({
      data: { full_name: "Creator", profile_pic_url: "https://x/pic.jpg", follower_count: 12345 },
    });
    expect(p).toEqual({ displayName: "Creator", avatarUrl: "https://x/pic.jpg", followers: 12345 });
  });

  it("plucks payloads with nested stats", () => {
    const p = normalizeProfile({ user: { nickname: "Creator", avatar_url: "https://x/a.jpg", stats: { followerCount: 999 } } });
    expect(p.displayName).toBe("Creator");
    expect(p.followers).toBe(999);
  });

  it("plucks YouTube-shaped payloads with string counts", () => {
    const p = normalizeProfile({ title: "Channel", subscriberCount: "5000" });
    expect(p.displayName).toBe("Channel");
    expect(p.followers).toBe(5000);
  });

  it("returns null followers rather than guessing on unknown shapes", () => {
    const p = normalizeProfile({ something: "else" });
    expect(p.followers).toBeNull();
  });
});

describe("normalizePosts", () => {
  it("plucks a top-level array of Instagram-shaped posts", () => {
    const posts = normalizePosts([
      { like_count: 100, comment_count: 10, taken_at: "2026-01-01T00:00:00Z" },
      { like_count: 200, comment_count: 20, taken_at: "2026-01-08T00:00:00Z" },
    ]);
    expect(posts).toEqual([
      { likes: 100, comments: 10, publishedAt: "2026-01-01T00:00:00Z" },
      { likes: 200, comments: 20, publishedAt: "2026-01-08T00:00:00Z" },
    ]);
  });

  it("plucks a { data: [...] } or { videos: [...] } wrapper", () => {
    expect(normalizePosts({ data: [{ likes: 5, comments: 1 }] })).toEqual([
      { likes: 5, comments: 1, publishedAt: null },
    ]);
    expect(normalizePosts({ videos: [{ likeCount: "9", commentCount: "3" }] })).toEqual([
      { likes: 9, comments: 3, publishedAt: null },
    ]);
  });

  it("caps at 20 posts", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ likes: i }));
    expect(normalizePosts(many)).toHaveLength(20);
  });

  it("returns an empty array rather than guessing on an unknown shape", () => {
    expect(normalizePosts({ something: "else" })).toEqual([]);
    expect(normalizePosts(null)).toEqual([]);
  });
});
