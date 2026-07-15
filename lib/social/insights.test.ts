import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", NEXT_PUBLIC_APP_URL: "http://localhost:3000", GEMINI_API_KEY: "test" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { buildInsightContext } = await import("./insights");
const { computeAnalytics } = await import("./analytics");

describe("buildInsightContext", () => {
  const NOW = new Date("2026-07-15T12:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000);

  it("renders only real computed numbers into the prompt factsheet", () => {
    const analytics = computeAnalytics(
      [
        { capturedAt: daysAgo(8), followers: 1000 },
        { capturedAt: daysAgo(0), followers: 1100 },
      ],
      [{ id: "p1", caption: "Big reel", publishedAt: daysAgo(2), likes: 50, reach: 1000, mediaType: "reel" }],
      7,
      NOW,
    );
    const ctx = buildInsightContext("instagram", analytics, [], { day: 2, block: 4, avgEngagementRate: 5, count: 2 });

    expect(ctx).toContain("Platform: Instagram");
    expect(ctx).toContain("Followers: 1.1K (+10.0% vs previous period)");
    expect(ctx).toContain("Average engagement rate: 5.0%");
    expect(ctx).toContain("Posts published: 1");
    expect(ctx).toContain('Top post 1: "Big reel"');
    expect(ctx).toContain("Best posting slot so far: Tuesday 4pm–8pm");
  });

  it("says 'unknown' rather than inventing a value when data is missing", () => {
    const analytics = computeAnalytics([], [], 7, NOW);
    const ctx = buildInsightContext("youtube", analytics, [], null);
    expect(ctx).toContain("Followers: unknown");
    expect(ctx).not.toContain("NaN");
    expect(ctx).not.toContain("null");
  });
});
