import { describe, expect, it, vi } from "vitest";

// autoclip-pipeline.ts pulls in prisma/redis/env/ffmpeg/elevenlabs/Gemini at
// module scope (it's the whole job-orchestration file, not just pure
// helpers) — mock the infra-touching modules so importing it here only
// requires no live DB/Redis/AWS, matching the pattern used by lib/auth.test.ts.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket", GEMINI_API_KEY: "test" },
}));

let configRow: { key: string; value: string } | null = null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => configRow) },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const {
  sliceWordsForClip, rebaseClipWords, computeCreditCost, getAutoClipPricing, AUTOCLIP_PRICING_DEFAULTS,
  buildBrollFilterComplex, computeKeeps, enforceNonOverlapping,
} = await import("./autoclip-pipeline");

describe("sliceWordsForClip", () => {
  const words = [
    { word: "hello", start: 1000, end: 1400 },
    { word: "world", start: 1500, end: 1900 },
    { word: "outside", start: 20000, end: 20500 },
  ];

  it("keeps only words overlapping the requested window and rebases to clip-relative ms", () => {
    const sliced = sliceWordsForClip(words, 1, 5); // 1s-5s -> 1000ms-5000ms
    expect(sliced).toEqual([
      { word: "hello", start: 0, end: 400 },
      { word: "world", start: 500, end: 900 },
    ]);
  });

  it("returns an empty array when nothing overlaps", () => {
    expect(sliceWordsForClip(words, 100, 200)).toEqual([]);
  });

  it("clamps negative rebased timestamps to 0 for a word that starts before the window", () => {
    const straddling = [{ word: "straddle", start: 900, end: 1500 }];
    const sliced = sliceWordsForClip(straddling, 1, 5);
    expect(sliced[0].start).toBe(0);
  });
});

describe("rebaseClipWords", () => {
  // Original clip was [10s, 20s]; words are stored relative to that (0-10000ms).
  const words = [
    { word: "a", start: 0, end: 400 },
    { word: "b", start: 2000, end: 2400 },
    { word: "c", start: 9000, end: 9500 },
  ];

  it("shifts words when the new start trims the front of the clip", () => {
    // New range [12s, 20s] — old start 10s -> shift = +2000ms
    const rebased = rebaseClipWords(words, 10, 12, 20);
    expect(rebased.map((w) => w.word)).toEqual(["b", "c"]); // "a" (0-400) now fully before 0
    expect(rebased[0]).toEqual({ word: "b", start: 0, end: 400 });
  });

  it("drops words that fall entirely outside the new [start,end) window", () => {
    const rebased = rebaseClipWords(words, 10, 10, 11); // new range only [10s,11s) = [0,1000)ms
    expect(rebased.map((w) => w.word)).toEqual(["a"]);
  });

  it("returns an unchanged (zero-shift) result when start doesn't actually move", () => {
    const rebased = rebaseClipWords(words, 10, 10, 20);
    expect(rebased).toEqual(words);
  });
});

describe("computeCreditCost", () => {
  it("charges per clip plus per 2-minute block for one short clip", () => {
    // 1 clip, 30s -> 1 two-minute block (rounded up)
    expect(computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS)).toBe(
      AUTOCLIP_PRICING_DEFAULTS.perClip + AUTOCLIP_PRICING_DEFAULTS.perTwoMinutes,
    );
  });

  it("scales with clip count and total duration, not a flat rate", () => {
    const one = computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS);
    const many = computeCreditCost(10, 300, AUTOCLIP_PRICING_DEFAULTS);
    expect(many).toBeGreaterThan(one);
  });

  it("rounds partial 2-minute blocks up (121s costs for 2 blocks)", () => {
    const cost = computeCreditCost(1, 121, AUTOCLIP_PRICING_DEFAULTS);
    expect(cost).toBe(AUTOCLIP_PRICING_DEFAULTS.perClip + AUTOCLIP_PRICING_DEFAULTS.perTwoMinutes * 2);
  });

  it("respects custom admin-configured rates", () => {
    const custom = { perClip: 2, perTwoMinutes: 3, analysisPerHalfHour: 1, rerender: 1 };
    expect(computeCreditCost(3, 150, custom)).toBe(3 * 2 + 3 * 2); // 3 clips, 2 blocks
  });
});

describe("getAutoClipPricing", () => {
  it("returns defaults when no Config row exists", async () => {
    configRow = null;
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });

  it("merges a partial admin-set Config row over the defaults", async () => {
    configRow = { key: "autoclip_pricing", value: JSON.stringify({ perClip: 3 }) };
    expect(await getAutoClipPricing()).toEqual({ ...AUTOCLIP_PRICING_DEFAULTS, perClip: 3 });
  });

  it("falls back to defaults if the stored Config value is corrupt JSON", async () => {
    configRow = { key: "autoclip_pricing", value: "{not valid json" };
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });
});

describe("buildBrollFilterComplex", () => {
  it("builds three labeled segments (main, broll, main) plus a concat", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("[vm0]"); // main before the insert
    expect(fc).toContain("[vb0]"); // the B-roll itself
    expect(fc).toContain("[vm1]"); // main after it
    expect(fc).toContain("concat=n=3:v=1:a=0");
    expect(fc).toContain("[video]");
  });

  it("trims segment A from 0 to the broll start, and segment C from the broll end to the clip's own duration", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("trim=start=0:end=3");
    expect(fc).toContain("trim=start=5.5:end=10");
  });

  it("scales the broll input to the aspect's target resolution and caps it to the window duration", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("scale=1080:1920");
    expect(fc).toContain("trim=0:2.5"); // 5.5 - 3
  });

  it("chains mood and caption filters after the concat, not before", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", "eq=saturation=1.5", "subtitles='x.ass'");
    const concatIdx = fc.indexOf("concat=n=3");
    const moodIdx = fc.indexOf("eq=saturation=1.5");
    const capIdx = fc.indexOf("subtitles=");
    expect(moodIdx).toBeGreaterThan(concatIdx);
    expect(capIdx).toBeGreaterThan(moodIdx);
  });

  // The crop is applied ONCE, before the stream is split into the two main
  // segments — not once per segment. `trim` + `setpts=PTS-STARTPTS` rebases t
  // to zero for each segment, so a time-varying crop applied after the trim
  // would replay the beginning of the pan path during segment C rather than
  // continuing it. Cropping first keeps t clip-relative, which is the basis
  // every crop keyframe is expressed in.
  it("crops once up front and splits, rather than cropping each main segment", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "16:9", null, null);
    expect((fc.match(/crop=in_w:in_w\*9\/16/g) ?? []).length).toBe(1);
    expect(fc).toContain("split=2[m0][m1]");
    // Both main segments are trimmed from the already-cropped stream.
    expect(fc).toContain("[m0]trim=start=0");
    expect(fc).toContain("[m1]trim=start=5.5");
  });

  // Regression for P2.6: a 2.5s stock insert used to cost the whole clip its
  // speaker tracking, because cropKeyframes were simply not computed for any
  // clip that got B-roll.
  it("carries a dynamic pan path through to the main segments when given one", () => {
    const dynamicCrop = "crop=w='(in_h*9/16)':h='in_h':x='if(lt(t,2),(0.1*in_w),(0.3*in_w))':y='0'";
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null, "[0:v]", dynamicCrop);
    expect(fc).toContain(dynamicCrop);
    // Still exactly one crop, still before the split.
    expect(fc.indexOf(dynamicCrop)).toBeLessThan(fc.indexOf("split=2"));
    expect(fc).not.toContain("crop=in_h*9/16:in_h"); // the static fallback is not used
  });
});

describe("computeKeeps filler-word matching", () => {
  it("cuts repeated-letter variants (umm/uhh/erm/hmm), not just the base forms", () => {
    const words = [
      { word: "so", start: 0, end: 200 },
      { word: "umm", start: 200, end: 500 },
      { word: "yeah", start: 500, end: 800 },
    ];
    const { cuts } = computeKeeps(words, 1, false, 400, true);
    expect(cuts).toEqual([{ startMs: 200, endMs: 500 }]);
  });

  it("cuts the two-word phrase 'you know' as a single span, since ASR emits it as two tokens", () => {
    const words = [
      { word: "well", start: 0, end: 300 },
      { word: "you", start: 300, end: 500 },
      { word: "know", start: 500, end: 800 },
      { word: "right", start: 800, end: 1100 },
    ];
    const { cuts } = computeKeeps(words, 2, false, 400, true);
    expect(cuts).toEqual([{ startMs: 300, endMs: 800 }]);
  });

  it("does not cut 'know' on its own when not preceded by 'you'", () => {
    const words = [
      { word: "did", start: 0, end: 200 },
      { word: "you", start: 200, end: 400 },
      { word: "see", start: 400, end: 600 }, // breaks the "you know" bigram
      { word: "know", start: 600, end: 900 },
    ];
    const { cuts } = computeKeeps(words, 2, false, 400, true);
    expect(cuts).toEqual([]);
  });
});

describe("enforceNonOverlapping", () => {
  it("leaves already-sorted, non-overlapping segments untouched", () => {
    const segs = [{ start: 0, end: 10 }, { start: 10, end: 20 }];
    expect(enforceNonOverlapping(segs, 5)).toEqual(segs);
  });

  it("sorts out-of-order segments by start time", () => {
    const segs = [{ start: 10, end: 20 }, { start: 0, end: 8 }];
    const result = enforceNonOverlapping(segs, 5);
    expect(result.map((s) => s.start)).toEqual([0, 10]);
  });

  it("clamps an overlapping segment's start forward to the previous segment's end", () => {
    const segs = [{ start: 0, end: 10 }, { start: 6, end: 20 }];
    const result = enforceNonOverlapping(segs, 5);
    expect(result).toEqual([{ start: 0, end: 10 }, { start: 10, end: 20 }]);
  });

  it("drops a segment entirely if clamping it would leave it shorter than minDuration", () => {
    const segs = [{ start: 0, end: 10 }, { start: 8, end: 12 }]; // clamped to [10,12) = 2s
    const result = enforceNonOverlapping(segs, 5); // min 5s
    expect(result).toEqual([{ start: 0, end: 10 }]);
  });
});
