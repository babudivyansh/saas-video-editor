import { describe, expect, it, vi } from "vitest";

// Isolated test for the pure computation added by competitor engagement
// tracking (avgLikes/avgComments/engagementRate/postsPerWeek) — separate
// file from the CRUD/orchestration in competitors.ts so it doesn't need
// prisma/redis mocked just to exercise arithmetic.

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000", SCRAPECREATORS_API_KEY: "k" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { incrWithExpire: vi.fn(async () => 1) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { computeEngagementStats } = await import("./competitors");

describe("computeEngagementStats", () => {
  it("averages likes/comments and derives engagement rate from followers", () => {
    const stats = computeEngagementStats(
      [
        { likes: 100, comments: 10, publishedAt: null },
        { likes: 200, comments: 20, publishedAt: null },
      ],
      1000,
    );
    expect(stats.postsCount).toBe(2);
    expect(stats.avgLikes).toBe(150);
    expect(stats.avgComments).toBe(15);
    // (150 + 15) / 1000 * 100 = 16.5
    expect(stats.engagementRate).toBeCloseTo(16.5);
  });

  it("computes posts per week from the observed publish-date span", () => {
    const stats = computeEngagementStats(
      [
        { likes: 1, comments: 0, publishedAt: "2026-01-01T00:00:00Z" },
        { likes: 1, comments: 0, publishedAt: "2026-01-08T00:00:00Z" },
        { likes: 1, comments: 0, publishedAt: "2026-01-15T00:00:00Z" },
      ],
      null,
    );
    // 3 posts over a 14-day span = 1.5 posts/week
    expect(stats.postsPerWeek).toBeCloseTo(1.5);
  });

  it("returns nulls rather than dividing by zero when there's no follower count", () => {
    const stats = computeEngagementStats([{ likes: 10, comments: 1, publishedAt: null }], null);
    expect(stats.engagementRate).toBeNull();
  });

  it("returns nulls across the board for an empty post list", () => {
    const stats = computeEngagementStats([], 1000);
    expect(stats).toEqual({
      postsCount: null,
      avgLikes: null,
      avgComments: null,
      engagementRate: null,
      postsPerWeek: null,
    });
  });
});
