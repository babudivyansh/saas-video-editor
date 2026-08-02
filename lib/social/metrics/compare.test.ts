import { describe, it, expect } from "vitest";
import {
  ER_BENCHMARKS,
  benchmark,
  compareCompetitors,
  comparePlatforms,
  vsOwnBaseline,
} from "./compare";

describe("benchmark", () => {
  it("places a rate inside its platform band", () => {
    expect(benchmark(2, "instagram")).toEqual({ verdict: "typical", low: 1, high: 3.5 });
  });

  it("flags below and above", () => {
    expect(benchmark(0.5, "instagram").verdict).toBe("below");
    expect(benchmark(9, "instagram").verdict).toBe("above");
  });

  it("uses a different band per platform", () => {
    // 1.5% is typical on Instagram but below par on YouTube.
    expect(benchmark(1.5, "instagram").verdict).toBe("typical");
    expect(benchmark(1.5, "youtube").verdict).toBe("below");
  });

  it("returns unknown for an unrecognised platform or a missing rate", () => {
    expect(benchmark(2, "tiktok").verdict).toBe("unknown");
    expect(benchmark(null, "instagram").verdict).toBe("unknown");
  });

  it("covers every supported platform", () => {
    for (const p of ["instagram", "facebook", "youtube"]) {
      expect(ER_BENCHMARKS[p]).toBeDefined();
      expect(ER_BENCHMARKS[p].low).toBeLessThan(ER_BENCHMARKS[p].high);
    }
  });
});

describe("vsOwnBaseline", () => {
  it("compares against the account's own history", () => {
    const r = vsOwnBaseline(6, [4, 4, 4]);
    expect(r.baseline).toBe(4);
    expect(r.deltaPct).toBe(50);
    expect(r.verdict).toBe("above");
  });

  it("treats a small swing as noise rather than a signal", () => {
    expect(vsOwnBaseline(4.2, [4, 4, 4]).verdict).toBe("typical");
    expect(vsOwnBaseline(3.8, [4, 4, 4]).verdict).toBe("typical");
  });

  it("flags a real decline", () => {
    expect(vsOwnBaseline(2, [4, 4, 4]).verdict).toBe("below");
  });

  it("returns unknown with no history or no current value", () => {
    expect(vsOwnBaseline(5, []).verdict).toBe("unknown");
    expect(vsOwnBaseline(null, [4]).verdict).toBe("unknown");
  });

  it("returns unknown rather than dividing by a zero baseline", () => {
    const r = vsOwnBaseline(5, [0, 0]);
    expect(r.deltaPct).toBeNull();
    expect(r.verdict).toBe("unknown");
  });
});

describe("comparePlatforms", () => {
  const rows = [
    { accountId: "a", provider: "youtube", label: "Chan", followers: 3000, engagementRate: 4 },
    { accountId: "b", provider: "instagram", label: "@ig", followers: 1000, engagementRate: 2 },
  ];

  it("ranks by followers, largest first", () => {
    expect(comparePlatforms(rows).map((r) => r.accountId)).toEqual(["a", "b"]);
  });

  it("computes each account's share of the total", () => {
    const out = comparePlatforms(rows);
    expect(out[0].followerShare).toBe(75);
    expect(out[1].followerShare).toBe(25);
  });

  it("returns a null share rather than dividing by zero", () => {
    const out = comparePlatforms([{ ...rows[0], followers: 0 }]);
    expect(out[0].followerShare).toBeNull();
  });

  it("handles an account with unknown followers", () => {
    const out = comparePlatforms([rows[0], { ...rows[1], followers: null }]);
    expect(out.find((r) => r.accountId === "b")!.followerShare).toBeNull();
  });

  it("returns nothing for no accounts", () => {
    expect(comparePlatforms([])).toEqual([]);
  });
});

describe("compareCompetitors", () => {
  const own = [
    { provider: "instagram", followers: 5000 },
    { provider: "youtube", followers: 2000 },
  ];

  it("computes the gap against our account on the SAME platform", () => {
    const out = compareCompetitors(own, [
      { id: "c1", handle: "rival", provider: "instagram", followers: 8000, engagementRate: 3, postsPerWeek: 5, weekGrowth: 100 },
    ]);
    expect(out[0].followerGap).toBe(3000);
  });

  it("reports a negative gap when we are ahead", () => {
    const out = compareCompetitors(own, [
      { id: "c1", handle: "small", provider: "instagram", followers: 1000, engagementRate: 1, postsPerWeek: 1, weekGrowth: 0 },
    ]);
    expect(out[0].followerGap).toBe(-4000);
  });

  it("leaves the gap null when we have no account on that platform", () => {
    const out = compareCompetitors(own, [
      { id: "c1", handle: "fb", provider: "facebook", followers: 9000, engagementRate: 1, postsPerWeek: 1, weekGrowth: 0 },
    ]);
    expect(out[0].followerGap).toBeNull();
  });

  it("compares against our largest account when we have several on one platform", () => {
    const many = [
      { provider: "instagram", followers: 1000 },
      { provider: "instagram", followers: 7000 },
    ];
    const out = compareCompetitors(many, [
      { id: "c1", handle: "rival", provider: "instagram", followers: 8000, engagementRate: 1, postsPerWeek: 1, weekGrowth: 0 },
    ]);
    expect(out[0].followerGap).toBe(1000);
  });

  it("ranks competitors by size", () => {
    const out = compareCompetitors(own, [
      { id: "small", handle: "s", provider: "instagram", followers: 100, engagementRate: 1, postsPerWeek: 1, weekGrowth: 0 },
      { id: "big", handle: "b", provider: "instagram", followers: 90_000, engagementRate: 1, postsPerWeek: 1, weekGrowth: 0 },
    ]);
    expect(out.map((c) => c.id)).toEqual(["big", "small"]);
  });
});
