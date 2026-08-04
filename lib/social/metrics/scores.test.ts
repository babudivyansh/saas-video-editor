import { describe, it, expect } from "vitest";
import {
  MIN_VIRAL_COHORT,
  accountHealth,
  postScoreComponents,
  viralCohort,
  viralScore,
  type HealthInputs,
} from "./scores";
import type { PostRow } from "./types";

const NOW = new Date("2026-08-03T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let seq = 0;
function post(over: Partial<PostRow> = {}): PostRow {
  seq += 1;
  return {
    id: `p${seq}`,
    publishedAt: daysAgo(10),
    mediaType: "video",
    views: 1000,
    likes: 50,
    comments: 5,
    shares: 5,
    reach: null,
    ...over,
  };
}

/** A cohort of `n` ordinary posts around `views`. */
function cohortOf(n: number, views = 1000, over: Partial<PostRow> = {}): PostRow[] {
  return Array.from({ length: n }, (_, i) =>
    post({ views: views + i * 10, likes: 50, comments: 5, shares: 5, ...over }),
  );
}

describe("viralCohort", () => {
  it("prefers posts of the same media type", () => {
    const target = post({ mediaType: "short" });
    const history = [...cohortOf(6, 1000, { mediaType: "short" }), ...cohortOf(6, 5000, { mediaType: "video" })];
    const cohort = viralCohort(target, history, NOW);
    expect(cohort).toHaveLength(6);
    expect(cohort.every((p) => p.mediaType === "short")).toBe(true);
  });

  it("falls back to all types when the same type is too rare to compare within", () => {
    const target = post({ mediaType: "short" });
    const history = [...cohortOf(2, 1000, { mediaType: "short" }), ...cohortOf(6, 5000, { mediaType: "video" })];
    expect(viralCohort(target, history, NOW)).toHaveLength(8);
  });

  it("excludes the post itself", () => {
    const target = post({ mediaType: "video" });
    const cohort = viralCohort(target, [target, ...cohortOf(6)], NOW);
    expect(cohort.some((p) => p.id === target.id)).toBe(false);
  });

  it("excludes posts outside the trailing window", () => {
    const target = post();
    const history = [...cohortOf(5), post({ publishedAt: daysAgo(200) })];
    expect(viralCohort(target, history, NOW)).toHaveLength(5);
  });
});

describe("viralScore", () => {
  it("returns null below the minimum cohort — never fakes a score on a new account", () => {
    expect(viralScore(post(), cohortOf(MIN_VIRAL_COHORT - 1))).toBeNull();
    expect(viralScore(post(), [])).toBeNull();
  });

  it("scores an ordinary post near the middle", () => {
    const score = viralScore(post({ views: 1020 }), cohortOf(20, 1000))!;
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(80);
  });

  it("scores a genuine outlier high", () => {
    const score = viralScore(post({ views: 500_000, shares: 5000 }), cohortOf(20, 1000))!;
    expect(score).toBeGreaterThan(70);
  });

  it("scores an underperformer low", () => {
    const score = viralScore(post({ views: 10, likes: 0, comments: 0, shares: 0 }), cohortOf(20, 5000))!;
    expect(score).toBeLessThan(35);
  });

  it("stays within 0-100", () => {
    for (const views of [0, 1, 100, 1e6, 1e9]) {
      const score = viralScore(post({ views }), cohortOf(20, 1000));
      if (score !== null) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("is not flattened by one prior viral hit — MAD resists the outlier", () => {
    const withHit = [...cohortOf(19, 1000), post({ views: 10_000_000 })];
    const score = viralScore(post({ views: 50_000, shares: 500 }), withHit)!;
    // With stddev-based scaling the single hit would compress this toward the middle.
    expect(score).toBeGreaterThan(55);
  });

  it("returns null when the post has no measurable audience", () => {
    expect(viralScore(post({ views: null, reach: null }), cohortOf(20))).toBeNull();
  });

  it("treats an unreported share rate as neutral — no better or worse than the median", () => {
    const cohort = cohortOf(20, 1000);
    const median = viralScore(post({ views: 1000, shares: 5 }), cohort)!;
    const unknown = viralScore(post({ views: 1000, shares: null }), cohort)!;
    const zero = viralScore(post({ views: 1000, shares: 0 }), cohort)!;
    // Unknown must sit strictly above an actual zero: absence of data is not
    // evidence of poor performance.
    expect(unknown).toBeGreaterThan(zero);
    // And no higher than a genuinely median share rate.
    expect(unknown).toBeLessThanOrEqual(median);
  });

  it("is deterministic", () => {
    const cohort = cohortOf(20);
    const p = post({ views: 4321 });
    expect(viralScore(p, cohort)).toBe(viralScore(p, cohort));
  });
});

describe("postScoreComponents", () => {
  it("returns null below the minimum cohort", () => {
    expect(postScoreComponents(post(), cohortOf(2))).toBeNull();
  });

  it("breaks the score into explainable parts", () => {
    const result = postScoreComponents(post({ views: 5000, shares: 500 }), cohortOf(20, 1000))!;
    expect(result.score).toBeGreaterThan(0);
    expect(result.reach).toBeGreaterThan(50);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("redistributes weight rather than penalising an unreported metric", () => {
    // No avgViewPercentage anywhere → retention drops out, confidence falls to
    // the remaining 0.85 of the weighting, and the score is computed over that
    // rather than treating the missing component as a zero.
    const result = postScoreComponents(post({ views: 5000 }), cohortOf(20, 1000))!;
    expect(result.retention).toBeNull();
    expect(result.confidence).toBeCloseTo(0.85, 2);
    // reach is the only strong component here (see the next test for why), so
    // the score is 100 × 0.35/0.85 — the missing 0.15 is excluded, not zeroed.
    expect(result.score).toBeCloseTo((100 * 0.35) / 0.85, 1);
  });

  it("does not reward reach that did not convert into engagement", () => {
    // 5× the cohort's views but the same absolute interactions, so the post's
    // engagement and share RATES are far below the cohort. A high-reach,
    // low-conversion post should not score like a hit.
    const wide = postScoreComponents(post({ views: 5000 }), cohortOf(20, 1000))!;
    expect(wide.reach).toBe(100);
    expect(wide.engagement).toBe(0);
    expect(wide.shares).toBe(0);
    expect(wide.score).toBeLessThan(50);

    // The same reach WITH proportional engagement scores far higher.
    const converting = postScoreComponents(
      post({ views: 5000, likes: 300, comments: 30, shares: 30 }),
      cohortOf(20, 1000),
    )!;
    expect(converting.score).toBeGreaterThan(wide.score);
    expect(converting.score).toBeGreaterThan(90);
  });

  it("uses retention when the platform reports it", () => {
    const cohort = cohortOf(20, 1000, { avgViewPercentage: 30 });
    const result = postScoreComponents(post({ views: 1000, avgViewPercentage: 90 }), cohort)!;
    expect(result.retention).toBeGreaterThan(50);
    expect(result.confidence).toBe(1);
  });
});

describe("accountHealth", () => {
  const full: HealthInputs = {
    growthRatePct: 4,
    engagementRate: 3,
    baselineEngagementRate: 3,
    consistencyScore: 80,
    retentionPct: 60,
    dataCompleteness: 1,
  };

  it("scores a healthy account well", () => {
    const h = accountHealth(full);
    expect(h.score).toBeGreaterThan(60);
    expect(h.confidence).toBe(1);
  });

  it("always returns all five components so the number can be explained", () => {
    const h = accountHealth(full);
    expect(h.components.map((c) => c.key)).toEqual([
      "growth",
      "engagement",
      "consistency",
      "retention",
      "completeness",
    ]);
    expect(h.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
  });

  it("treats flat growth as neutral, not as failure", () => {
    const h = accountHealth({ ...full, growthRatePct: 0 });
    expect(h.components.find((c) => c.key === "growth")!.value).toBe(50);
  });

  it("scores engagement against the account's own baseline", () => {
    const atBaseline = accountHealth({ ...full, engagementRate: 3, baselineEngagementRate: 3 });
    const doubled = accountHealth({ ...full, engagementRate: 6, baselineEngagementRate: 3 });
    expect(atBaseline.components.find((c) => c.key === "engagement")!.value).toBe(50);
    expect(doubled.components.find((c) => c.key === "engagement")!.value).toBe(100);
  });

  it("lowers confidence rather than the score when components are missing", () => {
    const partial = accountHealth({
      ...full,
      retentionPct: null,
      dataCompleteness: null,
    });
    expect(partial.confidence).toBeCloseTo(0.7, 2);
    // The remaining components still score well; missing data is not a penalty.
    expect(partial.score).toBeGreaterThan(60);
  });

  it("returns zero with zero confidence when nothing is known", () => {
    const none = accountHealth({
      growthRatePct: null,
      engagementRate: null,
      baselineEngagementRate: null,
      consistencyScore: null,
      retentionPct: null,
      dataCompleteness: null,
    });
    expect(none.score).toBe(0);
    expect(none.confidence).toBe(0);
  });

  it("clamps extreme inputs into 0-100", () => {
    const extreme = accountHealth({ ...full, growthRatePct: 10_000, engagementRate: 900, baselineEngagementRate: 1 });
    expect(extreme.score).toBeLessThanOrEqual(100);
    for (const c of extreme.components) {
      if (c.value !== null) {
        expect(c.value).toBeGreaterThanOrEqual(0);
        expect(c.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("scores a declining account below a growing one", () => {
    const declining = accountHealth({ ...full, growthRatePct: -8, engagementRate: 1, baselineEngagementRate: 3 });
    expect(declining.score).toBeLessThan(accountHealth(full).score);
  });
});
