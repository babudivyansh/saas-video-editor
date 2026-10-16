import { describe, expect, it } from "vitest";
import type { VideoClip } from "./types";
import { adjustCss, adjustFilters, effectActiveAt, needsWrapping, wrappedEffect } from "./video-look";

const clip = (over: Partial<VideoClip> = {}): VideoClip => ({ id: "v", type: "video", assetId: "a", srcIn: 0, timelineStart: 0, duration: 10, volume: 1, muted: false, effect: "glitch", ...over });

describe("adjust", () => {
  it("is empty when neutral", () => {
    expect(adjustFilters({ brightness: 0, contrast: 1, saturation: 1, warmth: 0 })).toEqual([]);
    expect(adjustCss(undefined)).toBe("");
  });

  it("builds eq and colorbalance filters and a CSS approximation", () => {
    const a = { brightness: 0.1, contrast: 1.2, saturation: 1.5, warmth: 0.5 };
    expect(adjustFilters(a)).toEqual(["eq=brightness=0.1:contrast=1.2:saturation=1.5", "colorbalance=rs=0.075:gs=0.011:bs=-0.075"]);
    expect(adjustCss(a)).toBe("brightness(1.1) contrast(1.2) saturate(1.5) sepia(0.175)");
  });
});

describe("effect window and strength", () => {
  it("whole clip at full strength needs no wrapping", () => {
    expect(needsWrapping(clip())).toBe(false);
    expect(effectActiveAt(clip(), 9.9)).toBe(true);
  });

  it("limits the effect to its window", () => {
    const c = clip({ effectStart: 2, effectEnd: 4 });
    expect(needsWrapping(c)).toBe(true);
    expect(effectActiveAt(c, 1)).toBe(false);
    expect(effectActiveAt(c, 3)).toBe(true);
    expect(wrappedEffect("noise=alls=10", c, "[p]", "[q]", "x0")).toBe(
      "[p]split[x0o][x0f];[x0f]noise=alls=10[x0e];[x0o][x0e]blend=all_expr='B':enable='between(t,2,4)'[q]",
    );
  });

  it("blends in at partial strength", () => {
    expect(wrappedEffect("noise=alls=10", clip({ effectStrength: 0.4 }), "[p]", "[q]", "x0")).toContain("blend=all_expr='A+(B-A)*0.4'[q]");
  });
});
