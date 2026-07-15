import { describe, expect, it } from "vitest";
import { computeAnalytics, postEngagementRate, type PostRow, type SnapshotRow } from "./analytics";

const NOW = new Date("2026-07-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000);

function post(overrides: Partial<PostRow>): PostRow {
  return { id: Math.random().toString(36).slice(2), ...overrides };
}

describe("postEngagementRate", () => {
  it("uses reach as the denominator when present", () => {
    expect(postEngagementRate(post({ likes: 40, comments: 10, reach: 1000 }))).toBe(5);
  });

  it("falls back to views and counts all interaction kinds", () => {
    expect(postEngagementRate(post({ likes: 10, comments: 5, shares: 3, saves: 2, views: 400 }))).toBe(5);
  });

  it("is null when no audience denominator exists", () => {
    expect(postEngagementRate(post({ likes: 100 }))).toBeNull();
  });
});

describe("computeAnalytics", () => {
  const snapshots: SnapshotRow[] = [
    { capturedAt: daysAgo(20), followers: 900, views: 40_000 },
    { capturedAt: daysAgo(8), followers: 1000, views: 50_000 },
    { capturedAt: daysAgo(3), followers: 1080, views: 56_000 },
    { capturedAt: daysAgo(0), followers: 1100, views: 60_000 },
  ];
  const posts: PostRow[] = [
    post({ publishedAt: daysAgo(2), likes: 50, reach: 1000, mediaType: "reel" }), // ER 5, in range
    post({ publishedAt: daysAgo(5), likes: 30, reach: 1000, mediaType: "image" }), // ER 3, in range
    post({ publishedAt: daysAgo(10), likes: 10, reach: 1000, mediaType: "image" }), // ER 1, previous period
  ];

  const a = computeAnalytics(snapshots, posts, 7, NOW);

  it("computes follower delta against the value at range start", () => {
    expect(a.followers.current).toBe(1100);
    expect(a.followers.previous).toBe(1000); // latest snapshot at-or-before 7d ago
    expect(a.followers.deltaPct).toBeCloseTo(10);
  });

  it("computes engagement rate for the range and the previous period", () => {
    expect(a.engagementRate.current).toBeCloseTo(4); // mean(5, 3)
    expect(a.engagementRate.previous).toBeCloseTo(1);
    expect(a.engagementRate.deltaPct).toBeCloseTo(300);
  });

  it("computes views gained within the window from snapshot deltas", () => {
    expect(a.views.current).toBe(10_000); // 60k now - 50k at window start
  });

  it("counts and ranks in-range posts, grouped by content type", () => {
    expect(a.postsInRange).toBe(2);
    expect(a.topPosts).toHaveLength(2);
    expect(a.contentTypes.map((c) => c.type).sort()).toEqual(["image", "reel"]);
    const reel = a.contentTypes.find((c) => c.type === "reel")!;
    expect(reel.avgEngagementRate).toBeCloseTo(5);
  });

  it("builds ascending daily series from snapshots inside the range", () => {
    expect(a.followerSeries.map((p) => p.value)).toEqual([1080, 1100]);
    expect(a.followerSeries[0].date < a.followerSeries[1].date).toBe(true);
  });

  it("handles an account with no data at all", () => {
    const empty = computeAnalytics([], [], 30, NOW);
    expect(empty.followers.current).toBeNull();
    expect(empty.engagementRate.current).toBeNull();
    expect(empty.topPosts).toEqual([]);
    expect(empty.postsInRange).toBe(0);
  });
});
