import { describe, it, expect } from "vitest";
import { computeDuckEnvelope, duckVolumeExpr, musicBedVolumeExpr } from "./audio-ducking";

describe("computeDuckEnvelope", () => {
  it("returns one full-gain segment when there is no speech", () => {
    expect(computeDuckEnvelope([], 10)).toEqual([{ start: 0, end: 10, gain: 1 }]);
  });

  it("pads speech by attack and release", () => {
    const segs = computeDuckEnvelope([{ start: 3, end: 4 }], 10, { attack: 0.5, release: 0.5 });
    const ducked = segs.find((s) => s.gain !== 1)!;
    expect(ducked.start).toBeCloseTo(2.5);
    expect(ducked.end).toBeCloseTo(4.5);
  });

  it("clamps the envelope to the total duration", () => {
    const segs = computeDuckEnvelope([{ start: 8, end: 20 }], 10);
    expect(Math.max(...segs.map((s) => s.end))).toBe(10);
  });

  it("merges speech islands closer than minGap", () => {
    const segs = computeDuckEnvelope(
      [{ start: 1, end: 2 }, { start: 2.1, end: 3 }],
      10,
      { attack: 0, release: 0, minGap: 0.5 },
    );
    expect(segs.filter((s) => s.gain !== 1)).toHaveLength(1);
  });
});

describe("duckVolumeExpr", () => {
  it("returns the fallback for an empty envelope", () => {
    expect(duckVolumeExpr([], 0.5)).toBe("0.5");
  });

  it("nests one between() per segment", () => {
    const expr = duckVolumeExpr([{ start: 0, end: 1, gain: 1 }, { start: 1, end: 2, gain: 0.2 }]);
    expect(expr.match(/between\(/g)).toHaveLength(2);
  });
});
describe("musicBedVolumeExpr", () => {
  it("falls back to the flat historic gain with no speech ranges", () => {
    expect(musicBedVolumeExpr([], 30)).toBe("0.12");
    expect(musicBedVolumeExpr([{ start: 0, end: 2 }], 0)).toBe("0.12");
  });

  it("ducks to 0.12 under speech and lifts to 0.35 in the gaps", () => {
    const expr = musicBedVolumeExpr([{ start: 2, end: 5 }], 10);
    expect(expr).toContain("0.12");
    expect(expr).toContain("0.35");
    // eval=frame is load-bearing: without it FFmpeg resolves the expression
    // once at t=0 and the bed plays at one level for the whole track.
    expect(expr).toMatch(/:eval=frame$/);
    expect(expr.startsWith("'")).toBe(true);
  });

  it("never lifts the bed above the ducked level while speech is continuous", () => {
    const expr = musicBedVolumeExpr([{ start: 0, end: 10 }], 10);
    expect(expr).not.toContain("0.35");
  });
});
