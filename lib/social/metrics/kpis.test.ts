import { describe, it, expect } from "vitest";
import { METRIC_KEYS } from "../capabilities";
import { computeDerivedKpis, computeKpis, dataCompleteness, type KpiInput } from "./kpis";
import type { DailyMetricRow } from "./types";

const WINDOW_START = new Date("2026-07-04T00:00:00Z");
const WINDOW_END = new Date("2026-08-03T00:00:00Z");

function day(date: string, over: Partial<DailyMetricRow> = {}): DailyMetricRow {
  return { date, ...over };
}

function input(over: Partial<KpiInput> = {}): KpiInput {
  return {
    provider: "instagram",
    observed: null,
    current: [],
    previous: [],
    followerSeries: [],
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    ...over,
  };
}

describe("KPI set shape", () => {
  it("returns every metric, always — the grid shape is stable across platforms", () => {
    for (const provider of ["youtube", "instagram", "facebook"] as const) {
      const set = computeKpis(input({ provider }));
      expect(Object.keys(set).sort()).toEqual([...METRIC_KEYS].sort());
    }
  });

  it("labels each metric with its availability and unit", () => {
    const set = computeKpis(input({ provider: "youtube" }));
    expect(set.views.available).toBe("native");
    expect(set.impressions.available).toBe("unavailable");
    expect(set.engagementRate.unit).toBe("percent");
    expect(set.watchTimeSec.unit).toBe("seconds");
  });
});

describe("the three distinct empty states", () => {
  // This is the distinction the old dashboard could not make.
  const rows = [day("2026-07-10", { views: 0, reach: 100 })];

  it("unavailable: null values plus a reason", () => {
    const set = computeKpis(input({ provider: "youtube", current: rows }));
    expect(set.impressions.available).toBe("unavailable");
    expect(set.impressions.current).toBeNull();
    expect(set.impressions.reason).toBeTruthy();
  });

  it("available but unreported: null, with no reason", () => {
    const set = computeKpis(input({ provider: "instagram", current: rows }));
    expect(set.profileViews.available).toBe("native");
    expect(set.profileViews.current).toBeNull();
    expect(set.profileViews.reason).toBeUndefined();
  });

  it("genuinely zero: 0, not null", () => {
    const set = computeKpis(input({ provider: "instagram", current: rows }));
    expect(set.views.current).toBe(0);
  });

  it("never emits a number for an unavailable metric", () => {
    const busy = [day("2026-07-10", { views: 5000, impressions: 9999, ctr: 4 })];
    const set = computeKpis(input({ provider: "youtube", current: busy }));
    // Even though the row carries impressions, YouTube cannot report them —
    // surfacing that value would be fabrication.
    expect(set.impressions.current).toBeNull();
    expect(set.ctr.current).toBeNull();
  });
});

describe("aggregation semantics", () => {
  const current = [
    day("2026-07-10", { views: 100, likes: 10, reach: 500, avgViewPercentage: 40 }),
    day("2026-07-11", { views: 200, likes: 20, reach: 700, avgViewPercentage: 60 }),
  ];

  it("sums additive metrics", () => {
    const set = computeKpis(input({ current }));
    expect(set.views.current).toBe(300);
    expect(set.likes.current).toBe(30);
    expect(set.reach.current).toBe(1200);
  });

  it("averages rate metrics rather than summing them", () => {
    // YouTube, because Instagram does not expose completion rate at all — on IG
    // this metric is correctly unavailable rather than averaged.
    const set = computeKpis(input({ provider: "youtube", current }));
    expect(set.avgViewPercentage.current).toBe(50);
    expect(computeKpis(input({ provider: "instagram", current })).avgViewPercentage.available).toBe(
      "unavailable",
    );
  });

  it("takes the last reported value for follower level", () => {
    const rows = [day("2026-07-10", { followers: 1000 }), day("2026-07-11", { followers: 1050 })];
    expect(computeKpis(input({ current: rows })).followers.current).toBe(1050);
  });

  it("ignores gaps when taking the last level", () => {
    const rows = [day("2026-07-10", { followers: 1000 }), day("2026-07-11", {})];
    expect(computeKpis(input({ current: rows })).followers.current).toBe(1000);
  });
});

describe("period-over-period deltas", () => {
  it("compares against the previous window", () => {
    const set = computeKpis(
      input({
        current: [day("2026-07-10", { views: 150 })],
        previous: [day("2026-06-10", { views: 100 })],
      }),
    );
    expect(set.views.current).toBe(150);
    expect(set.views.previous).toBe(100);
    expect(set.views.deltaPct).toBe(50);
  });

  it("leaves deltaPct null when the previous window is zero", () => {
    const set = computeKpis(
      input({
        current: [day("2026-07-10", { views: 150 })],
        previous: [day("2026-06-10", { views: 0 })],
      }),
    );
    expect(set.views.deltaPct).toBeNull();
  });

  it("leaves deltaPct null when there is no previous window", () => {
    const set = computeKpis(input({ current: [day("2026-07-10", { views: 150 })] }));
    expect(set.views.deltaPct).toBeNull();
  });
});

describe("derived metrics", () => {
  it("computes engagement rate over reach", () => {
    const set = computeKpis(
      input({ current: [day("2026-07-10", { totalInteractions: 50, reach: 1000 })] }),
    );
    expect(set.engagementRate.current).toBe(5);
  });

  it("falls back to views as the denominator when reach is unreported", () => {
    const set = computeKpis(
      input({ current: [day("2026-07-10", { totalInteractions: 50, views: 500 })] }),
    );
    expect(set.engagementRate.current).toBe(10);
  });

  it("sums the parts when totalInteractions is unreported", () => {
    const set = computeKpis(
      input({ current: [day("2026-07-10", { likes: 30, comments: 15, shares: 5, reach: 1000 })] }),
    );
    expect(set.engagementRate.current).toBe(5);
  });

  it("returns null rather than zero when the audience is unmeasurable", () => {
    const set = computeKpis(input({ current: [day("2026-07-10", { likes: 30 })] }));
    expect(set.engagementRate.current).toBeNull();
  });

  it("derives Instagram impressions from views", () => {
    const set = computeKpis(input({ provider: "instagram", current: [day("2026-07-10", { views: 800 })] }));
    expect(set.impressions.available).toBe("derived");
    expect(set.impressions.current).toBe(800);
  });

  it("derives CTR from clicks over impressions", () => {
    const set = computeKpis(
      input({ provider: "facebook", current: [day("2026-07-10", { websiteClicks: 25, impressions: 1000 })] }),
    );
    expect(set.ctr.current).toBe(2.5);
  });

  it("computes posting frequency per week over the window", () => {
    // 30-day window, 12 posts → 2.8/week.
    const set = computeKpis(input({ current: [day("2026-07-10", { postsPublished: 12 })] }));
    expect(set.postingFrequency.current).toBeCloseTo((12 / 30) * 7, 3);
  });
});

describe("capability overlay", () => {
  it("respects a per-account downgrade", () => {
    const set = computeKpis(
      input({
        provider: "instagram",
        observed: { reach: "unavailable" },
        current: [day("2026-07-10", { reach: 500 })],
      }),
    );
    expect(set.reach.available).toBe("unavailable");
    expect(set.reach.current).toBeNull();
    expect(set.reach.reason).toBeTruthy();
  });
});

describe("computeDerivedKpis", () => {
  it("computes average views per post", () => {
    const d = computeDerivedKpis(
      input({ current: [day("2026-07-10", { views: 1000, postsPublished: 4 })] }),
    );
    expect(d.averageViews.current).toBe(250);
  });

  it("returns null average views when nothing was published", () => {
    const d = computeDerivedKpis(
      input({ current: [day("2026-07-10", { views: 1000, postsPublished: 0 })] }),
    );
    expect(d.averageViews.current).toBeNull();
  });

  it("reports daily, weekly and monthly growth from the follower series", () => {
    const followerSeries = Array.from({ length: 31 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      value: 1000 + i * 10,
    }));
    const d = computeDerivedKpis(input({ followerSeries }));
    expect(d.dailyGrowth).toBeGreaterThan(0);
    expect(d.weeklyGrowth).toBeGreaterThan(0);
    expect(d.monthlyGrowth).toBeGreaterThan(0);
  });

  it("returns nulls with no follower history", () => {
    const d = computeDerivedKpis(input());
    expect(d.dailyGrowth).toBeNull();
  });
});

describe("dataCompleteness", () => {
  it("is 0 when nothing reported", () => {
    expect(dataCompleteness(computeKpis(input()))).toBe(0);
  });

  it("rises as more metrics arrive", () => {
    const sparse = dataCompleteness(computeKpis(input({ current: [day("2026-07-10", { views: 1 })] })));
    const rich = dataCompleteness(
      computeKpis(
        input({
          current: [
            day("2026-07-10", {
              views: 1, reach: 1, likes: 1, comments: 1, shares: 1, saves: 1,
              profileViews: 1, websiteClicks: 1, followers: 1, postsPublished: 1,
            }),
          ],
        }),
      ),
    );
    expect(rich).toBeGreaterThan(sparse);
  });

  it("does not penalise an account for a metric its platform lacks", () => {
    // YouTube cannot report impressions/ctr/reach/profileViews; those must be
    // excluded from the denominator rather than counted as missing data.
    const rows = [
      day("2026-07-10", { views: 1, likes: 1, comments: 1, shares: 1, followers: 1, postsPublished: 1, watchTimeSec: 1, avgViewDurationSec: 1, avgViewPercentage: 1, followersGained: 1, followersLost: 1, plays: 1 }),
    ];
    const yt = dataCompleteness(computeKpis(input({ provider: "youtube", current: rows })));
    expect(yt).toBeGreaterThan(0.7);
  });
});
