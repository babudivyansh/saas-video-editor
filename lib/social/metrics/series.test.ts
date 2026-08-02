import { describe, it, expect } from "vitest";
import {
  bucketLast,
  bucketMean,
  bucketSum,
  compoundGrowth,
  cumulativeSeries,
  delta,
  fillForward,
  fillGaps,
  firstValue,
  lastValue,
  latestValue,
  mad,
  mean,
  median,
  pctChange,
  percentileRank,
  rollingMean,
  stddev,
  sum,
  toDeltaSeries,
  windowDelta,
  type CumulativeRow,
  type DatedValue,
} from "./series";

const d = (iso: string) => new Date(iso);

describe("statistics", () => {
  it("mean", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNull();
  });

  it("median handles odd and even lengths without mutating the input", () => {
    const input = [5, 1, 3];
    expect(median(input)).toBe(3);
    expect(input).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("mad resists outliers where stddev does not", () => {
    const clean = [10, 10, 10, 10, 10];
    const withOutlier = [10, 10, 10, 10, 1000];
    expect(mad(clean)).toBe(0);
    expect(mad(withOutlier)).toBe(0); // the single spike does not move the MAD
    expect(stddev(withOutlier)!).toBeGreaterThan(400);
  });

  it("stddev needs at least two points", () => {
    expect(stddev([5])).toBeNull();
    expect(stddev([])).toBeNull();
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])!).toBeCloseTo(2.138, 3);
  });

  it("sum of nothing is zero", () => {
    expect(sum([])).toBe(0);
    expect(sum([1, -2, 3])).toBe(2);
  });

  it("percentileRank", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(0.75);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 99)).toBe(1);
    expect(percentileRank([], 1)).toBeNull();
  });
});

describe("pctChange", () => {
  it("computes a normal change", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });

  it("returns null rather than Infinity when the baseline is zero", () => {
    expect(pctChange(10, 0)).toBeNull();
  });

  it("returns null when either side is unknown", () => {
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
  });

  it("uses the absolute baseline so a negative previous still reads correctly", () => {
    expect(pctChange(-50, -100)).toBe(50); // moved up by half the magnitude
  });
});

describe("delta", () => {
  it("packages current, previous and the change", () => {
    expect(delta(120, 100)).toEqual({ current: 120, previous: 100, deltaPct: 20 });
  });
});

describe("bucketing", () => {
  const rows: DatedValue[] = [
    { date: "2026-08-03", value: 10 }, // Monday
    { date: "2026-08-04", value: 20 },
    { date: "2026-08-10", value: 5 }, // next Monday
    { date: "2026-09-01", value: 7 },
  ];

  it("bucketSum adds within each bucket", () => {
    expect(bucketSum(rows, "week", "UTC")).toEqual([
      { date: "2026-08-03", value: 30 },
      { date: "2026-08-10", value: 5 },
      { date: "2026-08-31", value: 7 }, // 2026-09-01 is a Tuesday
    ]);
  });

  it("bucketLast takes the final value — correct for cumulative levels", () => {
    expect(bucketLast(rows, "week", "UTC")[0]).toEqual({ date: "2026-08-03", value: 20 });
  });

  it("bucketMean averages — correct for rates", () => {
    expect(bucketMean(rows, "week", "UTC")[0]).toEqual({ date: "2026-08-03", value: 15 });
  });

  it("buckets by month", () => {
    expect(bucketSum(rows, "month", "UTC")).toEqual([
      { date: "2026-08-01", value: 35 },
      { date: "2026-09-01", value: 7 },
    ]);
  });

  it("passes day granularity through, sorted", () => {
    expect(bucketSum([{ date: "2026-08-04", value: 2 }, { date: "2026-08-03", value: 1 }], "day")).toEqual([
      { date: "2026-08-03", value: 1 },
      { date: "2026-08-04", value: 2 },
    ]);
  });

  it("handles unsorted input", () => {
    const shuffled = [rows[3], rows[1], rows[0], rows[2]];
    expect(bucketSum(shuffled, "week", "UTC")).toEqual(bucketSum(rows, "week", "UTC"));
  });

  it("drops non-finite values instead of poisoning the bucket", () => {
    const bad: DatedValue[] = [
      { date: "2026-08-03", value: 10 },
      { date: "2026-08-03", value: NaN },
      { date: "2026-08-03", value: Infinity },
    ];
    expect(bucketSum(bad, "day")).toEqual([{ date: "2026-08-03", value: 10 }]);
  });

  it("returns nothing for no rows", () => {
    expect(bucketSum([], "week")).toEqual([]);
  });
});

describe("fillGaps", () => {
  it("inserts absent days as zero, so a gap is not drawn as a trend line", () => {
    const points = [
      { date: "2026-08-01", value: 5 },
      { date: "2026-08-04", value: 9 },
    ];
    expect(fillGaps(points, d("2026-08-01T00:00:00Z"), d("2026-08-04T12:00:00Z"), "UTC")).toEqual([
      { date: "2026-08-01", value: 5 },
      { date: "2026-08-02", value: 0 },
      { date: "2026-08-03", value: 0 },
      { date: "2026-08-04", value: 9 },
    ]);
  });

  it("accepts a custom fill", () => {
    const filled = fillGaps([], d("2026-08-01T00:00:00Z"), d("2026-08-02T00:00:00Z"), "UTC", -1);
    expect(filled.every((p) => p.value === -1)).toBe(true);
  });
});

describe("fillForward", () => {
  it("carries the last known level forward", () => {
    const points = [
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-04", value: 130 },
    ];
    expect(fillForward(points, d("2026-08-01T00:00:00Z"), d("2026-08-05T12:00:00Z"), "UTC")).toEqual([
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-02", value: 100 },
      { date: "2026-08-03", value: 100 },
      { date: "2026-08-04", value: 130 },
      { date: "2026-08-05", value: 130 },
    ]);
  });

  it("omits leading days with no known value rather than inventing a zero", () => {
    const points = [{ date: "2026-08-03", value: 100 }];
    const out = fillForward(points, d("2026-08-01T00:00:00Z"), d("2026-08-03T12:00:00Z"), "UTC");
    expect(out).toEqual([{ date: "2026-08-03", value: 100 }]);
  });
});

describe("rollingMean", () => {
  it("smooths with a trailing window", () => {
    const points = [1, 2, 3, 4, 5].map((v, i) => ({ date: `2026-08-0${i + 1}`, value: v }));
    const out = rollingMean(points, 3);
    expect(out.map((p) => p.value)).toEqual([1, 1.5, 2, 3, 4]);
  });

  it("passes through for a window of 1 or less", () => {
    const points = [{ date: "2026-08-01", value: 7 }];
    expect(rollingMean(points, 1)).toBe(points);
  });
});

describe("windowDelta", () => {
  const rows: CumulativeRow[] = [
    { capturedAt: d("2026-07-01T00:00:00Z"), value: 1000 },
    { capturedAt: d("2026-07-15T00:00:00Z"), value: 1200 },
    { capturedAt: d("2026-08-01T00:00:00Z"), value: 1500 },
  ];

  it("measures last-in-window minus the pre-window baseline", () => {
    expect(windowDelta(rows, d("2026-07-01T00:00:00Z"), d("2026-08-02T00:00:00Z"))).toBe(500);
  });

  it("reads a quiet window as 0, not as missing data", () => {
    const quiet: CumulativeRow[] = [
      { capturedAt: d("2026-07-01T00:00:00Z"), value: 1000 },
      { capturedAt: d("2026-07-20T00:00:00Z"), value: 1000 },
    ];
    expect(windowDelta(quiet, d("2026-07-01T00:00:00Z"), d("2026-07-31T00:00:00Z"))).toBe(0);
  });

  it("returns null without a baseline", () => {
    expect(windowDelta(rows, d("2026-06-01T00:00:00Z"), d("2026-08-02T00:00:00Z"))).toBeNull();
  });

  it("returns null when nothing falls inside the window", () => {
    expect(windowDelta(rows, d("2026-08-02T00:00:00Z"), d("2026-08-03T00:00:00Z"))).toBeNull();
  });
});

describe("latestValue", () => {
  const rows: CumulativeRow[] = [
    { capturedAt: d("2026-07-01T00:00:00Z"), value: 10 },
    { capturedAt: d("2026-07-05T00:00:00Z"), value: 20 },
  ];

  it("takes the newest value at or before the cutoff", () => {
    expect(latestValue(rows, d("2026-07-03T00:00:00Z"))).toBe(10);
    expect(latestValue(rows, d("2026-07-05T00:00:00Z"))).toBe(20);
  });

  it("returns null before any data exists", () => {
    expect(latestValue(rows, d("2026-06-01T00:00:00Z"))).toBeNull();
  });
});

describe("cumulativeSeries", () => {
  it("keeps one point per day, using that day's last capture", () => {
    const rows: CumulativeRow[] = [
      { capturedAt: d("2026-08-01T02:00:00Z"), value: 100 },
      { capturedAt: d("2026-08-01T20:00:00Z"), value: 110 },
      { capturedAt: d("2026-08-02T05:00:00Z"), value: 120 },
    ];
    expect(cumulativeSeries(rows, d("2026-08-01T00:00:00Z"), "UTC")).toEqual([
      { date: "2026-08-01", value: 110 },
      { date: "2026-08-02", value: 120 },
    ]);
  });

  it("excludes captures before the window", () => {
    const rows: CumulativeRow[] = [
      { capturedAt: d("2026-07-01T00:00:00Z"), value: 1 },
      { capturedAt: d("2026-08-01T00:00:00Z"), value: 2 },
    ];
    expect(cumulativeSeries(rows, d("2026-07-15T00:00:00Z"), "UTC")).toHaveLength(1);
  });
});

describe("toDeltaSeries", () => {
  it("turns a running total into per-period gains", () => {
    const points = [
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-02", value: 110 },
      { date: "2026-08-03", value: 135 },
    ];
    expect(toDeltaSeries(points)).toEqual([
      { date: "2026-08-02", value: 10 },
      { date: "2026-08-03", value: 25 },
    ]);
  });

  it("clamps a provider restating a total downward to 0 rather than showing negative views", () => {
    const points = [
      { date: "2026-08-01", value: 100 },
      { date: "2026-08-02", value: 90 },
    ];
    expect(toDeltaSeries(points)).toEqual([{ date: "2026-08-02", value: 0 }]);
  });

  it("returns nothing for a single point", () => {
    expect(toDeltaSeries([{ date: "2026-08-01", value: 1 }])).toEqual([]);
  });
});

describe("compoundGrowth", () => {
  it("computes a daily compounding rate", () => {
    // Doubling over 30 days ≈ 2.34%/day.
    expect(compoundGrowth(1000, 2000, 30)!).toBeCloseTo(2.3374, 3);
  });

  it("reads flat as zero", () => {
    expect(compoundGrowth(1000, 1000, 30)).toBe(0);
  });

  it("handles decline", () => {
    expect(compoundGrowth(2000, 1000, 30)!).toBeLessThan(0);
  });

  it("returns null where the ratio is undefined", () => {
    expect(compoundGrowth(0, 100, 30)).toBeNull();
    expect(compoundGrowth(100, 0, 30)).toBeNull();
    expect(compoundGrowth(100, 200, 0)).toBeNull();
  });
});

describe("firstValue / lastValue", () => {
  it("reads the ends", () => {
    const points = [
      { date: "2026-08-01", value: 1 },
      { date: "2026-08-02", value: 9 },
    ];
    expect(firstValue(points)).toBe(1);
    expect(lastValue(points)).toBe(9);
  });

  it("returns null for an empty series", () => {
    expect(firstValue([])).toBeNull();
    expect(lastValue([])).toBeNull();
  });
});
