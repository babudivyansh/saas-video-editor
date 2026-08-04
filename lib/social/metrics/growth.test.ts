import { describe, it, expect } from "vitest";
import { growthBetween, growthRates, netFollowerChange, projectLinear } from "./growth";
import type { SeriesPoint } from "./series";

function series(n: number, start: number, step: number): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    value: start + i * step,
  }));
}

describe("growthRates", () => {
  it("reports total and absolute change across the series", () => {
    const g = growthRates(series(31, 1000, 10)); // 1000 → 1300
    expect(g.absolute).toBe(300);
    expect(g.total).toBe(30);
  });

  it("compounds the daily rate so windows are comparable", () => {
    const g = growthRates(series(31, 1000, 10));
    // 30 days of compounding to +30% ≈ 0.875%/day.
    expect(g.daily!).toBeCloseTo(0.875, 2);
  });

  it("reports weekly and monthly change over the trailing window", () => {
    const g = growthRates(series(31, 1000, 10));
    // Last 7 days: 1230 → 1300.
    expect(g.weekly!).toBeCloseTo((70 / 1230) * 100, 3);
    expect(g.monthly!).toBeCloseTo(30, 3);
  });

  it("uses the earliest point when the series is shorter than the window", () => {
    const g = growthRates(series(5, 1000, 10)); // only 5 days
    expect(g.weekly).toBe(g.total);
  });

  it("returns all nulls below two points", () => {
    expect(growthRates([])).toEqual({
      daily: null, weekly: null, monthly: null, total: null, absolute: null,
    });
    expect(growthRates(series(1, 1000, 0)).total).toBeNull();
  });

  it("reads a flat series as zero growth", () => {
    const g = growthRates(series(31, 1000, 0));
    expect(g.total).toBe(0);
    expect(g.daily).toBe(0);
    expect(g.absolute).toBe(0);
  });

  it("reports decline as negative", () => {
    const g = growthRates(series(31, 2000, -10));
    expect(g.absolute).toBe(-300);
    expect(g.total).toBe(-15);
    expect(g.daily!).toBeLessThan(0);
  });

  it("returns null rates rather than Infinity when starting from zero", () => {
    const g = growthRates(series(10, 0, 10));
    expect(g.total).toBeNull();
    expect(g.daily).toBeNull();
    expect(g.absolute).toBe(90); // absolute is still meaningful
  });
});

describe("growthBetween", () => {
  const a = { at: new Date("2026-07-01T00:00:00Z"), value: 1000 };
  const b = { at: new Date("2026-07-31T00:00:00Z"), value: 1300 };

  it("computes absolute, percentage and compounded daily change", () => {
    const g = growthBetween(a, b);
    expect(g.absolute).toBe(300);
    expect(g.pct).toBe(30);
    expect(g.daily!).toBeCloseTo(0.875, 2);
  });

  it("returns nulls when either endpoint is missing", () => {
    expect(growthBetween(null, b).absolute).toBeNull();
    expect(growthBetween(a, null).pct).toBeNull();
  });

  it("returns a null percentage rather than dividing by zero", () => {
    const g = growthBetween({ ...a, value: 0 }, b);
    expect(g.pct).toBeNull();
    expect(g.absolute).toBe(1300);
  });
});

describe("projectLinear", () => {
  it("compounds the current rate forward", () => {
    expect(projectLinear(1000, 1, 30)!).toBeCloseTo(1000 * 1.01 ** 30, 5);
  });

  it("returns the same value at a zero rate", () => {
    expect(projectLinear(1000, 0, 30)).toBe(1000);
  });

  it("projects decline downward", () => {
    expect(projectLinear(1000, -1, 30)!).toBeLessThan(1000);
  });

  it("returns null on unusable input", () => {
    expect(projectLinear(null, 1, 30)).toBeNull();
    expect(projectLinear(1000, null, 30)).toBeNull();
    expect(projectLinear(0, 1, 30)).toBeNull();
  });
});

describe("netFollowerChange", () => {
  it("turns a level series into per-day movement", () => {
    const out = netFollowerChange(series(4, 1000, 25));
    expect(out.map((p) => p.value)).toEqual([25, 25, 25]);
  });

  it("keeps negative movement, unlike a cumulative delta series", () => {
    const points = [
      { date: "2026-08-01", value: 1000 },
      { date: "2026-08-02", value: 950 },
    ];
    // Losing followers is real and must not be clamped away here.
    expect(netFollowerChange(points)).toEqual([{ date: "2026-08-02", value: -50 }]);
  });

  it("returns nothing for a single point", () => {
    expect(netFollowerChange(series(1, 1000, 0))).toEqual([]);
  });
});
