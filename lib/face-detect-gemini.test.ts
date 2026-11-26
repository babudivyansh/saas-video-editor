import fs from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// geminiJson is mocked per test; `null` from it is what a call that used up
// its whole 429 backoff on both models returns.
const gemini = vi.hoisted(() => ({
  configured: false,
  json: vi.fn<(args: {
    label: string; emptyAnswer?: unknown; primaryBackoffMs?: number[];
    parts: (string | { inlineData: { data: string } })[];
  }) => Promise<unknown>>(),
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/autoclip-ai/gemini", () => ({
  geminiConfigured: () => gemini.configured,
  geminiJson: gemini.json,
}));
// Frame extraction: write a tiny file where ffmpeg would put the jpeg.
vi.mock("@/utils/ffmpeg-render", () => ({
  ffmpegInputArgs: (p: string) => ["-i", p],
  // The "jpeg" holds the source path, so a test can tell which run a call is for.
  runFFmpegArgs: async (args: string[]) => { fs.writeFileSync(args[args.length - 1], args[args.indexOf("-i") + 1]); },
}));

const {
  sampleTimes, answerToFaceBoxes, detectFacesWithGemini, faceAnswerSchema, MAX_FRAMES, MIN_FRAMES,
  Limiter, spreadOrder, answeredCoverageOk, jitteredBackoff, GLOBAL_CALL_CONCURRENCY,
} = await import("@/lib/face-detect-gemini");

beforeEach(() => {
  gemini.configured = false;
  gemini.json.mockReset();
});

describe("sampleTimes", () => {
  it("caps a long source at MAX_FRAMES, evenly spaced", () => {
    const t = sampleTimes(2 * 60 * 60);
    expect(t).toHaveLength(MAX_FRAMES);
    expect(t[1] - t[0]).toBeCloseTo(60, 3);
  });
  it("samples a very short source once a second", () => {
    expect(sampleTimes(5)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5]);
  });
  it("keeps MIN_FRAMES on a short source, denser than 3 s", () => {
    const t = sampleTimes(30);
    expect(t).toHaveLength(MIN_FRAMES);
    expect(t[1] - t[0]).toBeCloseTo(1.5, 3);
  });
  it("samples a 1-minute source every 3 s, not every second", () => {
    expect(sampleTimes(60)).toHaveLength(20);
  });
  it("leaves sources of 6 minutes and up on MAX_FRAMES", () => {
    expect(sampleTimes(6 * 60)).toHaveLength(MAX_FRAMES);
    expect(sampleTimes(10 * 60)).toHaveLength(MAX_FRAMES);
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
  it("reads null and {} as no face in this frame (200s that failed the schema in prod)", () => {
    expect(faceAnswerSchema.parse(null)).toEqual({ faces: [] });
    expect(faceAnswerSchema.parse({})).toEqual({ faces: [] });
  });
});

describe("detectFacesWithGemini", () => {
  it("reports unconfigured without a Gemini key", async () => {
    expect(await detectFacesWithGemini("/nope.mp4", 60)).toEqual({ boxes: [], failure: "unconfigured" });
  });
});

describe("spreadOrder", () => {
  it("visits every frame once, ends and middle first", () => {
    const o = spreadOrder(108);
    expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: 108 }, (_, i) => i));
    expect(o.slice(0, 3)).toEqual([0, 64, 32]);
    // The first 13 calls already reach every eighth of the source.
    expect(new Set(o.slice(0, 13).map((i) => Math.floor(i / 13.5))).size).toBe(8);
  });
  it("handles tiny sources", () => {
    expect(spreadOrder(0)).toEqual([]);
    expect(spreadOrder(1)).toEqual([0]);
    expect([...spreadOrder(5)].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("answeredCoverageOk", () => {
  const sampled = sampleTimes(3600).slice(0, 108);
  it("accepts 35 well-spread frames of 108", () => {
    const answered = sampled.filter((_, i) => i % 3 === 0).slice(0, 35);
    expect(answeredCoverageOk(answered, sampled)).toBe(true);
  });
  it("rejects answers bunched in one stretch, or too few", () => {
    expect(answeredCoverageOk(sampled.slice(0, 40), sampled)).toBe(false);
    expect(answeredCoverageOk(sampled.filter((_, i) => i % 20 === 0), sampled)).toBe(false); // 6 frames
  });
  it("needs every frame of a source shorter than MIN_ANSWERED frames", () => {
    const five = sampleTimes(5);
    expect(answeredCoverageOk(five, five)).toBe(true);
    expect(answeredCoverageOk(five.slice(0, 4), five)).toBe(false);
  });
});

describe("Limiter", () => {
  it("never runs more than max at once, and runs everything", async () => {
    const lim = new Limiter(3);
    let active = 0, peak = 0, done = 0;
    await Promise.all(Array.from({ length: 20 }, () => lim.run(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 1));
      active--; done++;
    })));
    expect(peak).toBe(3);
    expect(done).toBe(20);
  });
});

describe("jitteredBackoff", () => {
  it("spreads each wait to 50-150%", () => {
    expect(jitteredBackoff([2000, 10000], () => 0)).toEqual([1000, 5000]);
    expect(jitteredBackoff([2000, 10000], () => 1)).toEqual([3000, 15000]);
  });
});

describe("detectFacesWithGemini under rate limiting", () => {
  const facecam = { faces: [[60, 770, 290, 880]] }; // top-right webcam

  it("builds a timeline when two thirds of calls are rate-limited out (CLIPIRO-WEB-23)", async () => {
    gemini.configured = true;
    let n = 0;
    gemini.json.mockImplementation(async () => (n++ % 3 === 0 ? facecam : null));
    const res = await detectFacesWithGemini("/src.mp4", 3600);
    expect(res.failure).toBeUndefined();
    expect(res.boxes.length).toBe(40); // ceil(120 / 3) answered
    expect(res.boxes.every((b) => b.x > 0.7 && b.y < 0.1)).toBe(true);
    // Answers cover the whole hour, not just its start.
    expect(res.boxes[0].tSec).toBeLessThan(300);
    expect(res.boxes[res.boxes.length - 1].tSec).toBeGreaterThan(3300);
    // Sorted by time for the reframe code.
    expect(res.boxes.map((b) => b.tSec)).toEqual([...res.boxes.map((b) => b.tSec)].sort((a, b) => a - b));
  });

  it("asks with backoff, an empty-answer default, and shares one limiter between parallel runs", async () => {
    gemini.configured = true;
    let active = 0, peak = 0;
    gemini.json.mockImplementation(async (args) => {
      peak = Math.max(peak, ++active);
      expect(args.primaryBackoffMs?.length).toBeGreaterThanOrEqual(3);
      expect(args.emptyAnswer).toEqual({ faces: [] });
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { faces: [] };
    });
    // Three AutoClip runs picking at once, as in prod.
    const runs = await Promise.all([1, 2, 3].map(() => detectFacesWithGemini("/src.mp4", 600)));
    expect(peak).toBe(GLOBAL_CALL_CONCURRENCY);
    expect(runs.every((r) => r.failure === undefined && r.boxes.length === 0)).toBe(true); // no faces ≠ failure
  });

  it("interleaves parallel runs, so the last one isn't starved behind the first two", async () => {
    gemini.configured = true;
    const order: string[] = [];
    gemini.json.mockImplementation(async (args) => {
      const img = args.parts[0] as { inlineData: { data: string } };
      order.push(Buffer.from(img.inlineData.data, "base64").toString());
      await new Promise((r) => setTimeout(r, 1));
      return { faces: [] };
    });
    await Promise.all(["/a.mp4", "/b.mp4", "/c.mp4"].map((p) => detectFacesWithGemini(p, 600)));
    expect(order).toHaveLength(360);
    expect(new Set(order.slice(0, 12))).toEqual(new Set(["/a.mp4", "/b.mp4", "/c.mp4"]));
    expect(new Set(order.slice(-12)).size).toBeGreaterThan(1);
  });

  it("still fails when almost nothing answers", async () => {
    gemini.configured = true;
    let n = 0;
    gemini.json.mockImplementation(async () => (n++ < 5 ? facecam : null));
    expect(await detectFacesWithGemini("/src.mp4", 3600)).toEqual({ boxes: [], failure: "error" });
  });
});
