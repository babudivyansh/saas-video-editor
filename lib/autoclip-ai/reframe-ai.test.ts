import { describe, expect, it, vi } from "vitest";

// Modules under test reach lib/env at import time (via lib/reframe and the
// ffmpeg helpers); none of these tests needs a real value.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));
import { composeAiCrop, cropOnBox, gamingFromFacecam, holdKeyframes, joinShots, type BaseCrop } from "@/lib/autoclip-ai/reframe-ai";
import { applySpeakerLead, speakerChanges } from "@/lib/autoclip-ai/speaker-lead";
import { fromBox2d, shotRanges } from "@/lib/autoclip-ai/scene-vision";
import type { CropKeyframe, StoredCrop } from "@/lib/reframe";
import type { WordTiming } from "@/utils/elevenlabs";

const SRC = { srcW: 1920, srcH: 1080 };

// A base framing that marks which window it was asked for.
function fakeBase(result: (s: number, e: number) => StoredCrop | null = (s, e) => ({
  mode: "single",
  keyframes: [{ tSec: 0, x: 0.1, y: 0, w: 0.3164, h: 1 }, { tSec: e - s, x: 0.2, y: 0, w: 0.3164, h: 1 }],
})) {
  return vi.fn<BaseCrop>((s, e) => result(s, e));
}

describe("composeAiCrop", () => {
  it("with no AI features is exactly the base framing for the whole clip", () => {
    const base = fakeBase();
    const out = composeAiCrop({ durationSec: 20, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base, ai: { features: {}, shots: [5, 10] } });
    expect(base).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledWith(0, 20);
    expect(out).toEqual(base.mock.results[0].value);
  });

  it("shot-aware: frames each shot on its own and cuts at the boundary", () => {
    const base = fakeBase();
    const out = composeAiCrop({
      durationSec: 20, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base,
      ai: { features: { shotAwareReframe: true }, shots: [8] },
    });
    expect(base.mock.calls.map((c) => [c[0], c[1]])).toEqual([[0, 8], [8, 20]]);
    expect(out?.mode).toBe("single");
    const kf = (out as { keyframes: CropKeyframe[] }).keyframes;
    // Hold to one frame before 8s, then the second shot's framing at 8s.
    const atCut = kf.filter((k) => Math.abs(k.tSec - 8) < 0.05);
    expect(atCut.length).toBeGreaterThanOrEqual(2);
    expect(kf.some((k) => Math.abs(k.tSec - 8) < 1e-6 && Math.abs(k.x - 0.1) < 1e-6)).toBe(true);
  });

  it("falls back to whole-clip framing when a shot wants a split", () => {
    const split: StoredCrop = { mode: "split", a: holdKeyframes({ x: 0, y: 0, w: 0.5, h: 1 }, 5), b: holdKeyframes({ x: 0.5, y: 0, w: 0.5, h: 1 }, 5) };
    const base = fakeBase(() => split);
    const out = composeAiCrop({ durationSec: 10, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base, ai: { features: { shotAwareReframe: true }, shots: [5] } });
    expect(out?.mode).toBe("split");
    expect(base).toHaveBeenLastCalledWith(0, 10);
  });

  it("holds a screen-recording shot on the screen Gemini found", () => {
    const base = fakeBase();
    const screenBox = { x: 0.6, y: 0.1, w: 0.35, h: 0.6 };
    const out = composeAiCrop({
      durationSec: 6, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base,
      ai: { features: { sceneVision: true }, shots: [], scenes: [{ startSec: 0, endSec: 6, type: "screen", confidence: 90, screenBox }] },
    }) as { mode: "single"; keyframes: CropKeyframe[] };
    const want = cropOnBox(screenBox, "9:16", SRC.srcW, SRC.srcH);
    expect(out.keyframes.every((k) => Math.abs(k.x - want.x) < 1e-9)).toBe(true);
    expect(base).not.toHaveBeenCalled();
  });

  it("ignores scene labels when the user chose their own speaker mode", () => {
    const base = fakeBase();
    composeAiCrop({
      durationSec: 6, aspect: "9:16", ...SRC, userSpeakerMode: "single", base,
      ai: { features: { sceneVision: true }, shots: [], scenes: [{ startSec: 0, endSec: 6, type: "screen", confidence: 90, screenBox: { x: 0.6, y: 0.1, w: 0.3, h: 0.5 } }] },
    });
    expect(base).toHaveBeenCalled();
  });

  it("uses the facecam layout when most of the clip is gameplay with a webcam", () => {
    const out = composeAiCrop({
      durationSec: 30, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base: fakeBase(),
      ai: { features: { sceneVision: true }, shots: [], scenes: [{ startSec: 0, endSec: 30, type: "gameplay_facecam", confidence: 85, facecamBox: { x: 0.75, y: 0.7, w: 0.2, h: 0.25 } }] },
    });
    expect(out?.mode).toBe("split");
  });

  it("follows a tracked product with the camera path solver", () => {
    const samples = Array.from({ length: 41 }, (_, i) => ({ t: i * 0.1, x: 0.2 + i * 0.01, y: 0.3, w: 0.1, h: 0.2 }));
    const out = composeAiCrop({
      durationSec: 4, aspect: "9:16", ...SRC, userSpeakerMode: "auto", base: fakeBase(),
      ai: {
        features: { sceneVision: true, subjectTrack: true }, shots: [],
        scenes: [{ startSec: 0, endSec: 4, type: "product", confidence: 90, subjectBox: { x: 0.2, y: 0.3, w: 0.1, h: 0.2 } }],
        tracks: [{ startSec: 0, endSec: 4, samples }],
      },
    }) as { keyframes: CropKeyframe[] };
    const xs = out.keyframes.map((k) => k.x);
    expect(xs[xs.length - 1]).toBeGreaterThan(xs[0]);
  });
});

describe("gamingFromFacecam / joinShots", () => {
  it("returns null for a source too narrow for the split", () => {
    expect(gamingFromFacecam({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 1080, 1920, 10)).toBeNull();
  });

  it("joinShots makes each shot run to one frame before the next", () => {
    const kf = joinShots([
      { startSec: 0, endSec: 5, kf: holdKeyframes({ x: 0, y: 0, w: 0.3, h: 1 }, 5) },
      { startSec: 5, endSec: 9, kf: holdKeyframes({ x: 0.5, y: 0, w: 0.3, h: 1 }, 4).map((k) => ({ ...k, tSec: k.tSec + 5 })) },
    ]);
    const before = kf.filter((k) => k.tSec < 5).pop()!;
    expect(before.x).toBe(0);
    expect(5 - before.tSec).toBeCloseTo(1 / 30, 5);
    expect(kf.find((k) => k.tSec === 5)?.x).toBe(0.5);
  });
});

describe("speaker lead", () => {
  const w = (word: string, startMs: number, speaker: string): WordTiming => ({ word, start: startMs, end: startMs + 300, speaker });

  it("finds where the speaker changes", () => {
    expect(speakerChanges([w("a", 0, "s0"), w("b", 500, "s0"), w("c", 1000, "s1")])).toEqual([{ tSec: 1, speaker: "s1" }]);
  });

  it("moves a late cut to just before the new speaker's first word", () => {
    const kf: CropKeyframe[] = [
      { tSec: 0, x: 0.1, y: 0, w: 0.3, h: 1 },
      { tSec: 4.6 - 1 / 30, x: 0.1, y: 0, w: 0.3, h: 1 },
      { tSec: 4.6, x: 0.6, y: 0, w: 0.3, h: 1 },
      { tSec: 9, x: 0.6, y: 0, w: 0.3, h: 1 },
    ];
    const words = [w("hi", 0, "s0"), w("there", 2000, "s0"), w("yes", 4000, "s1"), w("ok", 6000, "s1")];
    const out = applySpeakerLead(kf, words);
    const cut = out.find((k) => Math.abs(k.x - 0.6) < 1e-9)!;
    expect(cut.tSec).toBeCloseTo(4 - 0.25, 3);
    // Still a cut: the framing before it is held right up to it.
    const prev = out.filter((k) => k.tSec < cut.tSec).pop()!;
    expect(prev.x).toBeCloseTo(0.1, 6);
    expect(cut.tSec - prev.tSec).toBeLessThanOrEqual(1 / 25);
  });

  it("leaves the path alone without speaker labels", () => {
    const kf: CropKeyframe[] = [{ tSec: 0, x: 0, y: 0, w: 0.3, h: 1 }, { tSec: 1, x: 0, y: 0, w: 0.3, h: 1 }, { tSec: 2, x: 0, y: 0, w: 0.3, h: 1 }];
    expect(applySpeakerLead(kf, [{ word: "a", start: 0, end: 100 }])).toBe(kf);
  });
});

describe("scene vision helpers", () => {
  it("converts Gemini's [ymin,xmin,ymax,xmax] 0-1000 box to frame fractions", () => {
    expect(fromBox2d([100, 200, 600, 700])).toEqual({ x: 0.2, y: 0.1, w: 0.5, h: 0.5 });
    expect(fromBox2d([100, 200, 101, 201])).toBeUndefined();
  });

  it("turns shot boundaries into ranges and merges shots under a second", () => {
    expect(shotRanges([5, 5.4, 12], 20)).toEqual([
      { startSec: 0, endSec: 5.4 },
      { startSec: 5.4, endSec: 12 },
      { startSec: 12, endSec: 20 },
    ]);
    expect(shotRanges([0.5], 10)).toEqual([{ startSec: 0, endSec: 10 }]);
    expect(shotRanges([], 10)).toEqual([{ startSec: 0, endSec: 10 }]);
  });
});
