import { describe, expect, it } from "vitest";
import { calibrateScore } from "./virality-score";

describe("calibrateScore", () => {
  const flatSub = { hook: 50, pacing: 50, payoff: 50, engagement: 50 };

  it("stays within 0-99 for a maximally energetic, dense clip", () => {
    const r = calibrateScore(
      { hook: 99, pacing: 99, payoff: 99, engagement: 99 },
      { meanVolumeDb: -20, maxVolumeDb: 0, silenceSec: 0 },
      20,
      55, // ~2.75 words/sec, the "ideal" pace
    );
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(99);
    expect(r.composite).toBeGreaterThan(80); // near-ideal on every axis
  });

  it("penalizes a mostly-silent clip relative to an otherwise identical loud one", () => {
    const loud = calibrateScore(flatSub, { meanVolumeDb: -20, maxVolumeDb: -2, silenceSec: 0 }, 20, 55);
    const silent = calibrateScore(flatSub, { meanVolumeDb: -20, maxVolumeDb: -2, silenceSec: 18 }, 20, 55);
    expect(silent.composite).toBeLessThan(loud.composite);
  });

  it("penalizes flat/monotone audio (small dynamic range) relative to expressive audio", () => {
    const flat = calibrateScore(flatSub, { meanVolumeDb: -20, maxVolumeDb: -19, silenceSec: 0 }, 20, 55);
    const expressive = calibrateScore(flatSub, { meanVolumeDb: -30, maxVolumeDb: -2, silenceSec: 0 }, 20, 55);
    expect(flat.audio).toBeLessThan(expressive.audio);
    expect(flat.composite).toBeLessThan(expressive.composite);
  });

  it("scores an extreme speech rate (way too fast) lower than the ideal pace", () => {
    const ideal = calibrateScore(flatSub, { meanVolumeDb: -20, maxVolumeDb: -5, silenceSec: 0 }, 20, 55); // ~2.75 wps
    const rushed = calibrateScore(flatSub, { meanVolumeDb: -20, maxVolumeDb: -5, silenceSec: 0 }, 20, 200); // 10 wps
    expect(rushed.speechRate).toBeLessThan(ideal.speechRate);
  });

  it("never produces NaN or out-of-range values on degenerate zero-duration input", () => {
    const r = calibrateScore(flatSub, { meanVolumeDb: -30, maxVolumeDb: -10, silenceSec: 0 }, 0, 0);
    expect(Number.isFinite(r.composite)).toBe(true);
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(99);
  });

  it("clamps a pathologically wide dynamic-range reading instead of exceeding 99", () => {
    const r = calibrateScore(flatSub, { meanVolumeDb: -80, maxVolumeDb: 20, silenceSec: 0 }, 20, 55);
    expect(r.audio).toBeLessThanOrEqual(99);
  });
});
