import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

import { applyStepZoom, buildJumpZoomSteps, stepsFromPlan, JUMP_LIMITS, JUMP_ZOOM_LEVEL } from "@/lib/jump-zoom";
import { storedZoomStyle, DEFAULT_ZOOM_STYLE } from "@/lib/zoom-style";
import { parseAutoClipCreate } from "@/lib/autoclip-create-input";
import type { CropKeyframe } from "@/lib/reframe";
import type { WordTiming } from "@/utils/elevenlabs";

/** Sentences of `perSentence` words, 0.4s per word, a 0.5s pause between sentences. */
function speech(sentences: number, perSentence = 6): WordTiming[] {
  const out: WordTiming[] = [];
  let t = 0;
  for (let s = 0; s < sentences; s++) {
    for (let w = 0; w < perSentence; w++) {
      const last = w === perSentence - 1;
      out.push({ word: `w${s}_${w}${last ? "." : ""}`, start: t, end: t + 350 });
      t += 400;
    }
    t += 500;
  }
  return out;
}

const still: CropKeyframe[] = [
  { tSec: 0, x: 0.34, y: 0, w: 0.3164, h: 1 },
  { tSec: 30, x: 0.34, y: 0, w: 0.3164, h: 1 },
];
const zoomOf = (k: CropKeyframe) => 0.3164 / k.w;

describe("buildJumpZoomSteps", () => {
  it("alternates tight and wide on new sentences, spaced out, never in the first or last moment", () => {
    const words = speech(10);
    const dur = words[words.length - 1].end / 1000 + 0.5;
    const steps = buildJumpZoomSteps({ words, durationSec: dur, strength: "medium" });
    expect(steps.length).toBeGreaterThan(3);
    expect(steps.map((s) => s.zoom).slice(0, 4)).toEqual([1.15, 1, 1.15, 1]);
    for (let i = 1; i < steps.length; i++) expect(steps[i].tSec - steps[i - 1].tSec).toBeGreaterThanOrEqual(JUMP_LIMITS.minGapSec);
    for (const s of steps) {
      expect(s.tSec).toBeGreaterThanOrEqual(JUMP_LIMITS.leadInSec);
      expect(s.tSec).toBeLessThanOrEqual(dur - JUMP_LIMITS.leadOutSec);
    }
  });

  it("goes tight on an emphasised word mid-sentence, then back out on the next sentence", () => {
    // Two 12-word sentences: word 8 is at 3.2s, the second sentence starts at 5.3s.
    const words = speech(2, 12);
    const steps = buildJumpZoomSteps({ words, emphasis: [8], durationSec: 11, strength: "high" });
    expect(steps).toEqual([
      { tSec: 3.2, zoom: JUMP_ZOOM_LEVEL.high },
      { tSec: 5.3, zoom: 1 },
    ]);
  });

  it("skips an emphasis that would land within 2s of the last jump", () => {
    const words = speech(4);
    // word 9 (4.1s) is 1.2s after the jump on sentence 2 (2.9s).
    const steps = buildJumpZoomSteps({ words, emphasis: [9], durationSec: 15, strength: "high" });
    expect(steps.some((s) => Math.abs(s.tSec - 4.1) < 1e-6)).toBe(false);
  });

  it("does nothing without a transcript", () => {
    expect(buildJumpZoomSteps({ words: [], durationSec: 20, strength: "medium" })).toEqual([]);
  });
});

describe("stepsFromPlan", () => {
  it("snaps in on each planned punch-in and back out when its hold ends", () => {
    const steps = stepsFromPlan([{ tSec: 4, strength: 1, holdSec: 2 }, { tSec: 12, strength: 0.4, holdSec: 1.5 }], 30, "medium");
    expect(steps).toEqual([
      { tSec: 4, zoom: 1.15 },
      { tSec: 6, zoom: 1 },
      { tSec: 12, zoom: 1 + 0.15 * 0.5 },
      { tSec: 13.5, zoom: 1 },
    ]);
  });
});

describe("applyStepZoom", () => {
  it("cuts the zoom (one frame) instead of ramping, and holds it between steps", () => {
    const kf = applyStepZoom(still, [{ tSec: 5, zoom: 1.15 }, { tSec: 9, zoom: 1 }], 30);
    const before = kf.find((k) => Math.abs(k.tSec - (5 - 1 / 30)) < 1e-3)!;
    const at = kf.find((k) => Math.abs(k.tSec - 5) < 1e-6)!;
    expect(zoomOf(before)).toBeCloseTo(1, 6);
    expect(zoomOf(at)).toBeCloseTo(1.15, 6);
    const holdEnd = kf.find((k) => Math.abs(k.tSec - (9 - 1 / 30)) < 1e-3)!;
    expect(zoomOf(holdEnd)).toBeCloseTo(1.15, 6);
    expect(zoomOf(kf.find((k) => Math.abs(k.tSec - 9) < 1e-6)!)).toBeCloseTo(1, 6);
  });

  it("keeps the crop centred on the tracked subject and inside the frame", () => {
    const moving: CropKeyframe[] = [{ tSec: 0, x: 0, y: 0, w: 0.3164, h: 1 }, { tSec: 10, x: 0.6836, y: 0, w: 0.3164, h: 1 }];
    const kf = applyStepZoom(moving, [{ tSec: 5, zoom: 1.22 }], 10);
    for (const k of kf) {
      expect(k.x).toBeGreaterThanOrEqual(-1e-9);
      expect(k.x + k.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(k.y + k.h).toBeLessThanOrEqual(1 + 1e-9);
    }
    const at = kf.find((k) => Math.abs(k.tSec - 5) < 1e-6)!;
    expect(at.x + at.w / 2).toBeCloseTo(0.5, 3); // the path's centre at t=5
  });

  it("is a no-op with no steps", () => {
    expect(applyStepZoom(still, [], 30)).toBe(still);
  });
});

describe("zoom style setting", () => {
  it("defaults new runs to jump, keeps stored clips without a style on smooth", () => {
    expect(DEFAULT_ZOOM_STYLE).toBe("jump");
    expect(storedZoomStyle(undefined)).toBe("smooth");
    expect(storedZoomStyle("jump")).toBe("jump");
    const parsed = parseAutoClipCreate({ projectId: "p1" });
    expect(parsed.ok && parsed.data.zoomStyle).toBe("jump");
    expect(parseAutoClipCreate({ projectId: "p1", zoomStyle: "wobble" }).ok).toBe(false);
  });
});
