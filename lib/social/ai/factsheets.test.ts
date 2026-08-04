import { describe, expect, it } from "vitest";
import type { Kpi, KpiSet } from "../metrics/kpis";
import { METRIC_KEYS, type MetricKey } from "../capabilities";
import {
  buildAccountFactsheet,
  buildContentFactsheet,
  buildGrowthFactsheet,
  buildKpiFactsheet,
  buildPostBatchFactsheet,
  buildScheduleFactsheet,
  fmtByUnit,
  fmtDelta,
  renderFactsheet,
  type TopPostFact,
} from "./factsheets";

// The factsheet is the contract that must never lie, so these are golden-string
// assertions rather than shape assertions. If a number's rendering changes, the
// prompt changed, and that should be a deliberate edit here.

const NOW = new Date("2026-08-03T00:00:00Z");
const START = new Date("2026-07-27T00:00:00Z");

/** Every metric unavailable, so a test only opts into what it is exercising. */
function emptyKpis(): KpiSet {
  const set = {} as KpiSet;
  for (const metric of METRIC_KEYS) {
    set[metric] = {
      metric,
      available: "unavailable",
      unit: "count",
      reason: "not supported",
      current: null,
      previous: null,
      deltaPct: null,
    };
  }
  return set;
}

function kpi(metric: MetricKey, over: Partial<Kpi>): Kpi {
  return {
    metric,
    available: "native",
    unit: "count",
    current: null,
    previous: null,
    deltaPct: null,
    ...over,
  } as Kpi;
}

describe("formatting", () => {
  it("renders a missing value as 'unknown', never as zero", () => {
    expect(fmtByUnit(null, "count")).toBe("unknown");
    expect(fmtByUnit(null, "percent")).toBe("unknown");
    expect(fmtByUnit(0, "count")).toBe("0");
  });

  it("distinguishes no comparison data from a flat period", () => {
    expect(fmtDelta(null)).toBe("no comparison data");
    expect(fmtDelta(0)).toBe("+0.0% vs previous period");
    expect(fmtDelta(-12.34)).toBe("-12.3% vs previous period");
  });

  it("formats each unit in its own terms", () => {
    expect(fmtByUnit(1234, "count")).toBe("1.2K");
    expect(fmtByUnit(4.567, "percent")).toBe("4.6%");
    expect(fmtByUnit(90, "seconds")).toBe("1m 30s");
    expect(fmtByUnit(45, "seconds")).toBe("45s");
    expect(fmtByUnit(1.234, "ratio")).toBe("1.23");
    expect(fmtByUnit(87.65, "score")).toBe("87.7");
  });
});

describe("buildAccountFactsheet", () => {
  const kpis = emptyKpis();
  kpis.followers = kpi("followers", { current: 11_000, previous: 10_000, deltaPct: 10 });
  kpis.engagementRate = kpi("engagementRate", { unit: "percent", current: 4.2, previous: 5, deltaPct: -16 });
  kpis.views = kpi("views", { available: "native", current: null });

  const sheet = buildAccountFactsheet({
    provider: "instagram",
    label: "@clipiro",
    period: "weekly",
    windowStart: START,
    windowEnd: NOW,
    kpis,
    health: {
      score: 62.4,
      confidence: 0.8,
      components: [
        { label: "Growth", value: 71 },
        { label: "Retention", value: null },
      ],
    },
    contentMix: [{ type: "reel", count: 4, avgEngagementRate: 5.1 }],
    topPosts: [
      {
        id: "p1",
        caption: "  Behind the   scenes  ",
        audience: 12_400,
        audienceLabel: "reach",
        engagementRate: 6.3,
        score: { score: 88.2, reach: 90, engagement: 85, shares: 70, retention: null, confidence: 0.85 },
      },
    ],
    bestSlot: { day: 2, block: 4, avgEngagementRate: 7.1, count: 5 },
    alerts: [
      { kind: "milestone", severity: "info", code: "followerMilestone", params: { milestone: 10_000 }, message: "Passed 10K followers" },
    ],
  });
  const text = renderFactsheet(sheet);

  it("names the account and the exact window", () => {
    expect(sheet.lines[0]).toBe("Platform: Instagram — @clipiro");
    expect(sheet.lines[1]).toBe(
      "Period: the last week, 2026-07-27 to 2026-08-03, each metric compared with the equal-length window before it",
    );
  });

  it("renders each available KPI with its delta", () => {
    expect(text).toContain("Followers: 11K (+10.0% vs previous period)");
    expect(text).toContain("Engagement rate: 4.2% (-16.0% vs previous period)");
  });

  it("separates 'this platform cannot report it' from 'we have no data yet'", () => {
    expect(text).toContain("No data collected yet for: Views");
    expect(text).toMatch(/Not reported by this platform \(do not mention or estimate\): .*Impressions/);
    // Views is collectable here, so it must not appear in the platform list.
    const unavailableLine = sheet.lines.find((l) => l.startsWith("Not reported by this platform"))!;
    expect(unavailableLine).not.toContain("Views");
  });

  it("states health with its confidence and per-component values", () => {
    expect(text).toContain("Health score: 62/100 (confidence 80%) — Growth 71, Retention unknown");
  });

  it("collapses caption whitespace and labels the audience metric it actually has", () => {
    expect(text).toContain(
      'Top post 1: "Behind the scenes" — 12.4K reach, engagement rate 6.3%, performance score 88.2/100',
    );
  });

  it("names the best slot in weekday and block terms the schema also accepts", () => {
    expect(text).toContain("Best posting slot observed: Tuesday 4pm-8pm (avg engagement rate 7.1% over 5 posts)");
  });

  it("passes computed signals through verbatim", () => {
    expect(text).toContain("Signal: Passed 10K followers");
  });

  it("never emits a bare zero for an unavailable metric", () => {
    expect(text).not.toMatch(/Impressions: 0/);
  });
});

describe("buildKpiFactsheet", () => {
  it("explains an unavailable metric instead of describing a movement", () => {
    const kpis = emptyKpis();
    const sheet = buildKpiFactsheet({
      provider: "youtube",
      metric: "reach",
      kpi: { ...kpis.reach, reason: "YouTube has no reach metric." },
      windowStart: START,
      windowEnd: NOW,
      context: [],
    });
    expect(renderFactsheet(sheet)).toContain("This platform does not report Reach: YouTube has no reach metric.");
    expect(renderFactsheet(sheet)).not.toContain("Change:");
  });

  it("gives current, previous, change and the context metrics", () => {
    const sheet = buildKpiFactsheet({
      provider: "youtube",
      metric: "views",
      kpi: kpi("views", { current: 52_000, previous: 65_000, deltaPct: -20 }),
      windowStart: START,
      windowEnd: NOW,
      context: [kpi("postsPublished", { current: 3, previous: 6, deltaPct: -50 })],
    });
    const text = renderFactsheet(sheet);
    expect(text).toContain("Metric in question: Views");
    expect(text).toContain("Current: 52K");
    expect(text).toContain("Previous: 65K");
    expect(text).toContain("Change: -20.0% vs previous period");
    expect(text).toContain("Context — Posts published: 3 (-50.0% vs previous period)");
  });
});

const POST: TopPostFact = {
  id: "clx1",
  caption: "How we edit in 60 seconds",
  mediaType: "reel",
  publishedAt: new Date("2026-07-30T09:00:00Z"),
  audience: 8_200,
  audienceLabel: "views",
  engagementRate: 5.5,
  score: { score: 74, reach: 80, engagement: 65, shares: 72, retention: 55, confidence: 1 },
};

describe("buildContentFactsheet", () => {
  it("gives each post its id, score and component percentiles", () => {
    const text = renderFactsheet(
      buildContentFactsheet({
        provider: "instagram",
        windowStart: START,
        windowEnd: NOW,
        posts: [POST],
        consistency: { score: 68, avgGapDays: 2.5, gapStdDevDays: 1.2, daysSinceLastPost: 1 },
      }),
    );
    expect(text).toContain(
      'Post clx1: "How we edit in 60 seconds" [reel, 2026-07-30] — 8.2K views, engagement rate 5.5%, score 74.0/100 (reach percentile 80, engagement percentile 65, shares percentile 72, retention percentile 55)',
    );
    expect(text).toContain(
      "Posting consistency: 68/100, average gap 2.5 days (std dev 1.2), last post 1 days ago",
    );
  });

  it("says why a score is missing rather than omitting the post", () => {
    const text = renderFactsheet(
      buildContentFactsheet({
        provider: "instagram",
        windowStart: START,
        windowEnd: NOW,
        posts: [{ ...POST, score: null }],
      }),
    );
    expect(text).toContain("score unavailable (too few comparable posts)");
  });
});

describe("buildPostBatchFactsheet", () => {
  it("tags every row with the postId the model must echo back", () => {
    const text = renderFactsheet(buildPostBatchFactsheet({ provider: "youtube", posts: [POST], cohortSize: 24 }));
    expect(text).toContain("scored against the 24 comparable posts");
    expect(text).toContain(
      'postId=clx1 | caption="How we edit in 60 seconds" | type=reel | views=8.2K | engagementRate=5.5% | score=74.0/100',
    );
  });
});

describe("buildScheduleFactsheet", () => {
  it("states the timezone and the sample-size floor", () => {
    const text = renderFactsheet(
      buildScheduleFactsheet({
        provider: "instagram",
        slots: [{ day: 5, block: 3, avgEngagementRate: 6.4, count: 4 }],
        minSampleSize: 2,
        timezone: "Asia/Kolkata",
      }),
    );
    expect(text).toContain("All times are in Asia/Kolkata.");
    expect(text).toContain("fewer than 2 posts");
    expect(text).toContain("Friday 12pm-4pm: avg engagement rate 6.4% over 4 posts");
  });

  it("admits when nothing is rankable yet", () => {
    const text = renderFactsheet(
      buildScheduleFactsheet({ provider: "instagram", slots: [], minSampleSize: 2, timezone: "UTC" }),
    );
    expect(text).toContain("No slot has enough posts behind it yet to rank.");
  });
});

describe("buildGrowthFactsheet", () => {
  const kpis = emptyKpis();
  kpis.followers = kpi("followers", { current: 11_000, previous: 10_000, deltaPct: 10 });

  it("labels a weak forecast fit as indicative", () => {
    const text = renderFactsheet(
      buildGrowthFactsheet({
        provider: "instagram",
        kpis,
        forecast: {
          metric: "followers",
          method: "holt-damped",
          r2: 0.12,
          alpha: 0.4,
          beta: 0.1,
          points: [{ date: "2026-09-01", value: 12_500 }],
          lower: [{ date: "2026-09-01", value: 11_800 }],
          upper: [{ date: "2026-09-01", value: 13_200 }],
        },
      }),
    );
    expect(text).toContain(
      "Forecast (Followers, damped trend, fit quality 0.12): 12.5K by 2026-09-01, plausible range 11.8K to 13.2K",
    );
    expect(text).toContain("Forecast fit is weak");
  });

  it("says a goal is behind pace without recomputing it", () => {
    const text = renderFactsheet(
      buildGrowthFactsheet({
        provider: "instagram",
        kpis,
        goals: [
          {
            metric: "followers",
            goalId: "g1",
            pct: 40,
            current: 11_000,
            target: 15_000,
            baseline: 10_000,
            onTrack: false,
            daysRemaining: 20,
            requiredDailyRate: 200,
            actualDailyRate: 50,
            projectedHitAt: null,
            hit: false,
            overdue: false,
          },
        ],
      }),
    );
    expect(text).toContain("Goal (followers): 11K of 15K, 40% done, 20 days remaining, behind pace");
  });

  it("reports the competitor gap as computed", () => {
    const text = renderFactsheet(
      buildGrowthFactsheet({
        provider: "instagram",
        kpis,
        competitors: [
          { id: "c1", handle: "rival", provider: "instagram", followers: 25_000, followerGap: 14_000, engagementRate: 3.1, postsPerWeek: 5, weekGrowth: 300 },
        ],
      }),
    );
    expect(text).toContain(
      "Competitor @rival (Instagram): 25K followers (gap 14K), engagement rate 3.1%, 5.0 posts/week",
    );
  });
});
