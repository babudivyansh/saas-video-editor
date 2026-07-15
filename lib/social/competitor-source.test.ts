import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000", SCRAPECREATORS_API_KEY: "k" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { normalizeProfile } = await import("./competitor-source");

describe("normalizeProfile", () => {
  it("plucks Instagram-shaped payloads", () => {
    const p = normalizeProfile({
      data: { full_name: "Creator", profile_pic_url: "https://x/pic.jpg", follower_count: 12345 },
    });
    expect(p).toEqual({ displayName: "Creator", avatarUrl: "https://x/pic.jpg", followers: 12345 });
  });

  it("plucks TikTok-shaped payloads with nested stats", () => {
    const p = normalizeProfile({ user: { nickname: "Tok", avatar_url: "https://x/a.jpg", stats: { followerCount: 999 } } });
    expect(p.displayName).toBe("Tok");
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
