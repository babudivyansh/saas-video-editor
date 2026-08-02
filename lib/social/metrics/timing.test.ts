import { describe, it, expect } from "vitest";
import {
  BLOCKS_PER_DAY,
  computeBestTimes,
  heatmap,
  postingConsistency,
  postingFrequency,
  rankedTimeSlots,
} from "./timing";
import type { PostRow } from "./types";

const NOW = new Date("2026-08-03T12:00:00Z"); // Monday
let seq = 0;

function post(publishedAt: string, over: Partial<PostRow> = {}): PostRow {
  seq += 1;
  return {
    id: `p${seq}`,
    publishedAt: new Date(publishedAt),
    views: 1000,
    likes: 50,
    comments: 0,
    shares: 0,
    ...over,
  };
}

describe("computeBestTimes", () => {
  it("buckets into weekday × 4-hour cells", () => {
    // 2026-08-03 is a Monday (day 1); 10:00 falls in block 2 (08:00-11:59).
    const { cells } = computeBestTimes([post("2026-08-03T10:00:00Z")], "UTC");
    expect(cells).toEqual([{ day: 1, block: 2, avgEngagementRate: 5, count: 1 }]);
  });

  it("has six blocks per day", () => {
    expect(BLOCKS_PER_DAY).toBe(6);
    const { cells } = computeBestTimes(
      [post("2026-08-03T01:00:00Z"), post("2026-08-03T23:00:00Z")],
      "UTC",
    );
    expect(cells.map((c) => c.block)).toEqual([0, 5]);
  });

  it("averages several posts in one cell", () => {
    const { cells } = computeBestTimes(
      [
        post("2026-08-03T10:00:00Z", { likes: 100 }), // 10%
        post("2026-08-03T11:00:00Z", { likes: 200 }), // 20%
      ],
      "UTC",
    );
    expect(cells[0]).toMatchObject({ count: 2, avgEngagementRate: 15 });
  });

  it("shifts cells by IANA timezone", () => {
    // 22:00 Sunday UTC is 03:30 Monday in IST — a different day AND block.
    const posts = [post("2026-08-02T22:00:00Z")];
    expect(computeBestTimes(posts, "UTC").cells[0]).toMatchObject({ day: 0, block: 5 });
    expect(computeBestTimes(posts, "Asia/Kolkata").cells[0]).toMatchObject({ day: 1, block: 0 });
  });

  it("still accepts a legacy UTC-offset in minutes", () => {
    // The existing client sends -new Date().getTimezoneOffset().
    const posts = [post("2026-08-02T22:00:00Z")];
    expect(computeBestTimes(posts, 330).cells[0]).toMatchObject({ day: 1, block: 0 });
  });

  it("prefers a cell with a repeatable signal over a one-off spike", () => {
    const { best } = computeBestTimes(
      [
        post("2026-08-04T10:00:00Z", { likes: 900 }), // one-off, 90%
        post("2026-08-03T14:00:00Z", { likes: 200 }), // 20%, twice
        post("2026-08-03T15:00:00Z", { likes: 200 }),
      ],
      "UTC",
    );
    expect(best).toMatchObject({ day: 1, block: 3, count: 2 });
  });

  it("falls back to a single-post cell when nothing repeats", () => {
    const { best } = computeBestTimes([post("2026-08-04T10:00:00Z")], "UTC");
    expect(best).toMatchObject({ count: 1 });
  });

  it("ignores posts with no engagement rate or no timestamp", () => {
    const { cells, best } = computeBestTimes(
      [post("2026-08-03T10:00:00Z", { views: null, reach: null }), { id: "x", views: 100, likes: 1 }],
      "UTC",
    );
    expect(cells).toEqual([]);
    expect(best).toBeNull();
  });

  it("returns an empty result for no posts", () => {
    expect(computeBestTimes([], "UTC")).toEqual({ cells: [], best: null });
  });
});

describe("rankedTimeSlots", () => {
  it("returns the strongest repeatable slots", () => {
    const times = computeBestTimes(
      [
        post("2026-08-03T10:00:00Z", { likes: 100 }),
        post("2026-08-03T11:00:00Z", { likes: 100 }),
        post("2026-08-04T18:00:00Z", { likes: 300 }),
        post("2026-08-04T19:00:00Z", { likes: 300 }),
      ],
      "UTC",
    );
    const slots = rankedTimeSlots(times, 2);
    expect(slots).toHaveLength(2);
    expect(slots[0].avgEngagementRate).toBeGreaterThan(slots[1].avgEngagementRate);
  });

  it("excludes slots below the minimum sample", () => {
    const times = computeBestTimes([post("2026-08-03T10:00:00Z")], "UTC");
    expect(rankedTimeSlots(times, 3, 2)).toEqual([]);
  });
});

describe("postingFrequency", () => {
  it("converts a window count to posts per week", () => {
    expect(postingFrequency(12, 30)).toBeCloseTo(2.8, 3);
    expect(postingFrequency(7, 7)).toBe(7);
  });

  it("reads zero posts as zero, not unknown", () => {
    expect(postingFrequency(0, 30)).toBe(0);
  });

  it("returns null for a nonsensical window", () => {
    expect(postingFrequency(5, 0)).toBeNull();
  });
});

describe("postingConsistency", () => {
  const daily = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      post(new Date(NOW.getTime() - (n - 1 - i) * 86_400_000).toISOString()),
    );

  it("scores a perfectly regular cadence at 100", () => {
    const c = postingConsistency(daily(10), NOW);
    expect(c.score).toBe(100);
    expect(c.avgGapDays).toBeCloseTo(1, 5);
    expect(c.gapStdDevDays).toBeCloseTo(0, 5);
  });

  it("is scale-free: weekly and daily cadences both score 100 if regular", () => {
    const weekly = Array.from({ length: 8 }, (_, i) =>
      post(new Date(NOW.getTime() - (7 - i) * 7 * 86_400_000).toISOString()),
    );
    expect(postingConsistency(weekly, NOW).score).toBe(100);
  });

  it("scores bursts and silences low", () => {
    const bursty = [
      post("2026-06-01T10:00:00Z"),
      post("2026-06-01T11:00:00Z"),
      post("2026-06-01T12:00:00Z"),
      post("2026-08-01T10:00:00Z"), // two months later
    ];
    expect(postingConsistency(bursty, NOW).score!).toBeLessThan(20);
  });

  it("reports days since the last post", () => {
    const c = postingConsistency([post("2026-07-29T12:00:00Z")], NOW);
    expect(c.daysSinceLastPost).toBeCloseTo(5, 3);
  });

  it("refuses to score below three posts", () => {
    const c = postingConsistency([post("2026-08-01T12:00:00Z"), post("2026-08-02T12:00:00Z")], NOW);
    expect(c.score).toBeNull();
    expect(c.daysSinceLastPost).not.toBeNull(); // but still reports recency
  });

  it("returns all nulls for no posts", () => {
    expect(postingConsistency([], NOW)).toEqual({
      score: null,
      avgGapDays: null,
      gapStdDevDays: null,
      daysSinceLastPost: null,
    });
  });

  it("handles unsorted input", () => {
    const posts = daily(6);
    const shuffled = [posts[3], posts[0], posts[5], posts[1], posts[4], posts[2]];
    expect(postingConsistency(shuffled, NOW).score).toBe(postingConsistency(posts, NOW).score);
  });
});

describe("heatmap", () => {
  it("averages an arbitrary metric per cell", () => {
    const cells = heatmap(
      [post("2026-08-03T10:00:00Z", { views: 100 }), post("2026-08-03T11:00:00Z", { views: 300 })],
      (p) => p.views ?? null,
      "UTC",
    );
    expect(cells).toEqual([{ day: 1, block: 2, value: 200, count: 2 }]);
  });

  it("omits cells with no posts rather than emitting zero", () => {
    // "never posted then" must be distinguishable from "posted and it flopped".
    const cells = heatmap([post("2026-08-03T10:00:00Z")], (p) => p.views ?? null, "UTC");
    expect(cells).toHaveLength(1);
  });

  it("skips posts whose metric is unknown or non-finite", () => {
    const cells = heatmap(
      [post("2026-08-03T10:00:00Z", { views: null }), post("2026-08-03T10:30:00Z", { views: NaN })],
      (p) => p.views ?? null,
      "UTC",
    );
    expect(cells).toEqual([]);
  });
});
