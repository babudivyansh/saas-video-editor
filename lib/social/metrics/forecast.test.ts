import { describe, it, expect } from "vitest";
import { MIN_FORECAST_POINTS, daysToTarget, forecast } from "./forecast";
import type { SeriesPoint } from "./series";

/** `n` daily points starting at `start`, stepping by `step`, with optional noise. */
function series(n: number, start: number, step: number, noise = 0): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    // Deterministic pseudo-noise — a real RNG would make these tests flaky.
    const wobble = noise === 0 ? 0 : Math.sin(i * 1.7) * noise;
    out.push({ date: d.toISOString().slice(0, 10), value: start + i * step + wobble });
  }
  return out;
}

describe("forecast refusal", () => {
  it("returns null below the minimum history — no fantasy line through noise", () => {
    expect(forecast(series(MIN_FORECAST_POINTS - 1, 1000, 10), 30)).toBeNull();
    expect(forecast([], 30)).toBeNull();
    expect(forecast(series(2, 1000, 10), 30)).toBeNull();
  });

  it("produces a forecast at exactly the minimum", () => {
    expect(forecast(series(MIN_FORECAST_POINTS, 1000, 10), 7)).not.toBeNull();
  });

  it("returns null for a non-positive horizon", () => {
    expect(forecast(series(30, 1000, 10), 0)).toBeNull();
    expect(forecast(series(30, 1000, 10), -5)).toBeNull();
  });

  it("returns null when the input contains non-finite values", () => {
    const bad = series(30, 1000, 10);
    bad[5].value = NaN;
    expect(forecast(bad, 30)).toBeNull();
  });
});

describe("forecast shape", () => {
  const f = forecast(series(60, 1000, 20), 30)!;

  it("returns exactly the requested horizon", () => {
    expect(f.points).toHaveLength(30);
    expect(f.lower).toHaveLength(30);
    expect(f.upper).toHaveLength(30);
  });

  it("continues from the day after the last observation", () => {
    expect(f.points[0].date).toBe("2026-03-02"); // 2026-01-01 + 60 days = 03-01
  });

  it("emits strictly increasing dates", () => {
    for (let i = 1; i < f.points.length; i += 1) {
      expect(f.points[i].date > f.points[i - 1].date).toBe(true);
    }
  });

  it("brackets the projection with its interval", () => {
    f.points.forEach((p, i) => {
      expect(f.lower[i].value).toBeLessThanOrEqual(p.value);
      expect(f.upper[i].value).toBeGreaterThanOrEqual(p.value);
    });
  });

  it("widens the interval with the horizon", () => {
    const firstSpread = f.upper[0].value - f.lower[0].value;
    const lastSpread = f.upper[29].value - f.lower[29].value;
    expect(lastSpread).toBeGreaterThan(firstSpread);
  });

  it("reports its method and fitted parameters", () => {
    expect(f.method).toBe("holt-damped");
    expect(f.alpha).toBeGreaterThan(0);
    expect(f.beta).toBeGreaterThan(0);
  });
});

describe("forecast accuracy", () => {
  it("continues a clean linear trend", () => {
    const f = forecast(series(60, 1000, 20), 10)!;
    // 60 points ending at 1000 + 59×20 = 2180; damped so it undershoots pure linear.
    expect(f.points[0].value).toBeGreaterThan(2180);
    expect(f.points[9].value).toBeGreaterThan(f.points[0].value);
    expect(f.r2).toBeGreaterThan(0.9);
  });

  it("damps rather than extrapolating a steep trend to infinity", () => {
    const f = forecast(series(30, 1000, 100), 365)!;
    const undamped = 1000 + 29 * 100 + 365 * 100; // ≈ 40,400
    expect(f.points[364].value).toBeLessThan(undamped);
  });

  it("damps without gutting a genuine trend over a 30-day horizon", () => {
    // Damping must temper a projection, not flatten it. At phi=0.9 the model
    // asymptotes at 9 days' worth of trend, which would tell a steadily growing
    // account it will gain almost nothing next month and makes goal projection
    // useless. This pins the balance.
    const f = forecast(series(60, 1000, 20), 30)!;
    const last = 1000 + 59 * 20; // 2180
    const gain = f.points[29].value - last;
    const undampedGain = 30 * 20; // 600
    expect(gain).toBeGreaterThan(undampedGain * 0.6);
    expect(gain).toBeLessThan(undampedGain);
  });

  it("projects a decline downward", () => {
    const f = forecast(series(40, 5000, -30), 10)!;
    expect(f.points[9].value).toBeLessThan(f.points[0].value);
  });

  it("stays flat for a flat series and reports a low r2", () => {
    const f = forecast(series(40, 1000, 0), 10)!;
    expect(f.points[9].value).toBeCloseTo(1000, 0);
    expect(f.r2).toBe(0); // nothing to explain — no better than the mean
  });

  it("is deterministic: identical input gives an identical forecast", () => {
    const input = series(40, 1000, 15, 25);
    const a = forecast(input, 20)!;
    const b = forecast(input, 20)!;
    expect(a.points).toEqual(b.points);
    expect(a.alpha).toBe(b.alpha);
    expect(a.beta).toBe(b.beta);
  });

  it("widens the interval for a noisier series", () => {
    const clean = forecast(series(60, 1000, 20, 0), 10)!;
    const noisy = forecast(series(60, 1000, 20, 300), 10)!;
    const spread = (f: typeof clean) => f.upper[9].value - f.lower[9].value;
    expect(spread(noisy)).toBeGreaterThan(spread(clean));
  });
});

describe("daysToTarget", () => {
  it("finds when a rising series reaches a target", () => {
    // 60 points ending at 2180, gaining ~20/day → ~15 days to 2500.
    const days = daysToTarget(series(60, 1000, 20), 2500)!;
    expect(days).toBeGreaterThan(5);
    expect(days).toBeLessThan(40);
  });

  it("returns null when the trend never reaches the target", () => {
    expect(daysToTarget(series(60, 1000, 20), 10_000_000)).toBeNull();
  });

  it("returns null without enough history to forecast", () => {
    expect(daysToTarget(series(5, 1000, 20), 1500)).toBeNull();
  });

  it("handles a declining series reaching a lower target", () => {
    const days = daysToTarget(series(40, 5000, -30), 4000);
    expect(days === null || days > 0).toBe(true);
  });
});
