import { describe, expect, it } from "vitest";
import { averageStats, matchAdjust, WARMTH_UNIT, type ColorStats } from "./color-match";

const stats = (over: Partial<ColorStats> = {}): ColorStats => ({ y: 110, spread: 100, sat: 20, u: 128, v: 128, ...over });

describe("matchAdjust", () => {
  it("is neutral when the clips already match", () => {
    expect(matchAdjust(stats(), stats())).toEqual({ brightness: 0, contrast: 1, saturation: 1, warmth: 0 });
  });

  it("lifts a dark, flat, dull, cool clip toward a bright, punchy, warm one", () => {
    const src = stats({ y: 80, spread: 60, sat: 10, u: 130, v: 126 });
    const ref = stats({ y: 120, spread: 90, sat: 18, u: 124, v: 134 });
    const a = matchAdjust(src, ref);
    expect(a.contrast).toBe(1.5);
    // (120 - 128 - (80 - 128) * 1.5) / 255 = 0.251
    expect(a.brightness).toBe(0.25);
    expect(a.saturation).toBe(1.8);
    // (134 - 124 - (126 - 130) * 1.8) / 16.4 = 1.05 -> clamped to 1
    expect(a.warmth).toBe(1);
  });

  it("clamps to the Fine-tune slider ranges", () => {
    const a = matchAdjust(stats({ y: 20, spread: 10, sat: 3 }), stats({ y: 250, spread: 200, sat: 90, v: 200, u: 60 }));
    expect(a).toEqual({ brightness: 0.3, contrast: 1.5, saturation: 2, warmth: 1 });
  });

  it("leaves contrast and saturation alone on a flat or grey source", () => {
    const a = matchAdjust(stats({ spread: 2, sat: 1 }), stats({ spread: 120, sat: 30 }));
    expect(a.contrast).toBe(1);
    expect(a.saturation).toBe(1);
  });

  it("cools a warm clip toward a neutral one", () => {
    const a = matchAdjust(stats({ v: 128 + WARMTH_UNIT / 4, u: 128 - WARMTH_UNIT / 4 }), stats());
    expect(a.warmth).toBe(-0.5);
  });
});

describe("averageStats", () => {
  it("averages frames and returns null for none", () => {
    expect(averageStats([])).toBeNull();
    expect(averageStats([stats({ y: 100 }), stats({ y: 120 })])!.y).toBe(110);
  });
});
