// Growth forecasting.
//
// Holt's linear trend with damping, fitted by a deterministic grid search. No
// randomness, no model call, no library — a forecast has to be reproducible, and
// a number produced by a language model would be fabrication.
//
// The important behaviour here is the REFUSAL: below MIN_POINTS this returns
// null and the UI says "need more history" rather than drawing a confident line
// through two weeks of noise.

import { eachDay, type TimeZone } from "./dates";
import type { SeriesPoint } from "./series";

/** Below two weeks of daily observations a trend is not distinguishable from noise. */
export const MIN_FORECAST_POINTS = 14;

/**
 * Damping factor. Keeps a steep short-term trend from projecting to infinity,
 * because social growth decelerates — an account adding 500 followers/day this
 * week is not adding 182,500 in a year.
 *
 * The projected total gain converges to `trend × φ/(1-φ)`, so φ sets how much
 * cumulative trend the model will ever concede. 0.9 caps that at 9 days' worth,
 * which is far too aggressive for daily data: it would tell a steadily growing
 * account that it will gain almost nothing over the next month, and would make
 * goal projection useless. 0.98 caps at 49 days' worth — over a 30-day horizon
 * that is ~76% of the undamped trend, which tempers the projection without
 * gutting it.
 */
const PHI = 0.98;

export interface Forecast {
  /** Projected points, continuing the input series. */
  points: SeriesPoint[];
  /** Lower bound of the prediction interval (~80%). */
  lower: SeriesPoint[];
  upper: SeriesPoint[];
  method: "holt-damped";
  /** Fit quality, 0–1. Below ~0.3 the UI should present this as weak. */
  r2: number;
  /** Fitted smoothing parameters, surfaced so the fit can be inspected. */
  alpha: number;
  beta: number;
}

interface Fit {
  level: number;
  trend: number;
  sse: number;
  residuals: number[];
}

/** One pass of Holt's damped trend over the data at fixed (alpha, beta). */
function runHolt(values: number[], alpha: number, beta: number): Fit {
  let level = values[0];
  let trend = values[1] - values[0];
  let sse = 0;
  const residuals: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const forecastValue = level + PHI * trend;
    const error = values[i] - forecastValue;
    sse += error * error;
    residuals.push(error);

    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * forecastValue;
    trend = beta * (level - prevLevel) + (1 - beta) * PHI * trend;
  }

  return { level, trend, sse, residuals };
}

function stddevOf(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
}

/**
 * Forecast the next `horizonDays` of a daily series.
 *
 * Returns null when there is not enough history, when the series is flat (no
 * trend to project), or when the input contains non-finite values.
 */
export function forecast(
  points: SeriesPoint[],
  horizonDays: number,
  tz: TimeZone = "UTC",
): Forecast | null {
  if (points.length < MIN_FORECAST_POINTS || horizonDays <= 0) return null;

  const values = points.map((p) => p.value);
  if (!values.every((v) => Number.isFinite(v))) return null;

  // Grid search over alpha and beta, minimising SSE. Deterministic by
  // construction — same input, same parameters, same forecast, every time.
  let best: Fit | null = null;
  let bestAlpha = 0.3;
  let bestBeta = 0.1;
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      const alpha = a / 10;
      const beta = b / 10;
      const fit = runHolt(values, alpha, beta);
      if (!Number.isFinite(fit.sse)) continue;
      if (best === null || fit.sse < best.sse) {
        best = fit;
        bestAlpha = alpha;
        bestBeta = beta;
      }
    }
  }
  if (best === null) return null;

  // R² against the mean, so a fit no better than "assume the average" scores 0.
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const totalSS = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  const r2 = totalSS > 0 ? Math.max(0, 1 - best.sse / totalSS) : 0;

  const residualSd = stddevOf(best.residuals);
  const lastDate = new Date(`${points[points.length - 1].date}T12:00:00Z`);
  const horizonEnd = new Date(lastDate.getTime() + horizonDays * 86_400_000);
  // eachDay is inclusive of the start day, which is already in the input series.
  const dates = eachDay(lastDate, horizonEnd, tz).slice(1);

  const out: SeriesPoint[] = [];
  const lower: SeriesPoint[] = [];
  const upper: SeriesPoint[] = [];

  let dampedSum = 0;
  for (let h = 1; h <= dates.length; h += 1) {
    dampedSum += PHI ** h;
    const value = best.level + dampedSum * best.trend;
    // Interval widens with the square root of the horizon; 1.28σ ≈ 80%.
    const spread = 1.28 * residualSd * Math.sqrt(h);
    const date = dates[h - 1];
    out.push({ date, value });
    lower.push({ date, value: value - spread });
    upper.push({ date, value: value + spread });
  }

  return {
    points: out,
    lower,
    upper,
    method: "holt-damped",
    r2: Math.round(r2 * 1000) / 1000,
    alpha: bestAlpha,
    beta: bestBeta,
  };
}

/**
 * Days until the series is projected to reach `target`, or null if it is not
 * projected to within `maxDays`. Used by goal tracking.
 */
export function daysToTarget(points: SeriesPoint[], target: number, maxDays = 365): number | null {
  const f = forecast(points, maxDays);
  if (!f) return null;
  const current = points[points.length - 1].value;
  const rising = target > current;
  for (let i = 0; i < f.points.length; i += 1) {
    const v = f.points[i].value;
    if ((rising && v >= target) || (!rising && v <= target)) return i + 1;
  }
  return null;
}
