import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));

const { sampleTimes, answerToFaceBoxes, detectFacesWithGemini, faceAnswerSchema, MAX_FRAMES } = await import("@/lib/face-detect-gemini");

describe("sampleTimes", () => {
  it("caps a long source at MAX_FRAMES, evenly spaced", () => {
    const t = sampleTimes(2 * 60 * 60);
    expect(t).toHaveLength(MAX_FRAMES);
    expect(t[1] - t[0]).toBeCloseTo(60, 3);
  });
  it("samples a short source once a second", () => {
    expect(sampleTimes(5)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
  });
  it("is empty for no duration", () => {
    expect(sampleTimes(0)).toEqual([]);
  });
});

describe("answerToFaceBoxes", () => {
  it("maps Gemini's 0-1000 [ymin,xmin,ymax,xmax] boxes to frame fractions at the frame's time", () => {
    expect(answerToFaceBoxes({ faces: [[80, 860, 170, 910], [5, 5, 10, 10]] }, 5))
      .toEqual([{ tSec: 5, x: 0.86, y: 0.08, w: 0.05, h: 0.09, confidence: 90 }]); // degenerate box dropped
    expect(answerToFaceBoxes({ faces: [] }, 5)).toEqual([]);
  });
});

describe("faceAnswerSchema", () => {
  it("accepts the asked-for shape, a bare list, and box_2d objects", () => {
    const want = { faces: [[80, 860, 170, 910]] };
    expect(faceAnswerSchema.parse(want)).toEqual(want);
    expect(faceAnswerSchema.parse([[80, 860, 170, 910]])).toEqual(want);
    expect(faceAnswerSchema.parse({ faces: [{ box_2d: [80, 860, 170, 910], label: "face" }] })).toEqual(want);
    expect(faceAnswerSchema.safeParse({ faces: "none" }).success).toBe(false);
  });
});

describe("detectFacesWithGemini", () => {
  it("reports unconfigured without a Gemini key", async () => {
    expect(await detectFacesWithGemini("/nope.mp4", 60)).toEqual({ boxes: [], failure: "unconfigured" });
  });
});
