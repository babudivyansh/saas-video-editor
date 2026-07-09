import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { PEXELS_API_KEY: undefined, JAMENDO_CLIENT_ID: undefined, GIPHY_API_KEY: undefined },
}));

const { computeBrollWindow } = await import("./broll");

describe("computeBrollWindow", () => {
  it("returns null for clips shorter than the minimum (6s)", () => {
    expect(computeBrollWindow(5)).toBeNull();
    expect(computeBrollWindow(5.9)).toBeNull();
  });

  it("returns a window starting a third of the way into the clip", () => {
    const w = computeBrollWindow(20);
    expect(w).not.toBeNull();
    expect(w!.startSec).toBeCloseTo(7, 1); // 20 * 0.35
  });

  it("keeps the window fully inside the clip, leaving at least 1s at the end", () => {
    const durations = [6, 6.5, 8, 20, 60, 300];
    for (const d of durations) {
      const w = computeBrollWindow(d);
      if (!w) continue;
      expect(w.startSec).toBeGreaterThanOrEqual(0);
      expect(w.endSec).toBeLessThanOrEqual(d - 1 + 1e-9);
      expect(w.endSec).toBeGreaterThan(w.startSec);
    }
  });

  it("caps the window at ~2.5s even for a very long clip", () => {
    const w = computeBrollWindow(300);
    expect(w!.endSec - w!.startSec).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it("returns null rather than a degenerate sub-1s window near the boundary", () => {
    // A duration just over the minimum can produce a window right at the
    // "leave 1s at the end" boundary — must not emit end <= start.
    for (let d = 6; d < 7; d += 0.05) {
      const w = computeBrollWindow(d);
      if (w) expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(1);
    }
  });
});
