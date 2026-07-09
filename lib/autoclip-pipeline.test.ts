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
  buildBrollFilterComplex,
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
  it("charges exactly the base cost for one short clip", () => {
    // 1 clip, 30s -> 1 minute (rounded up)
    expect(computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS)).toBe(
      AUTOCLIP_PRICING_DEFAULTS.base + AUTOCLIP_PRICING_DEFAULTS.perMinute,
    );
  });

  it("scales with extra clips and total duration, not a flat rate", () => {
    const one = computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS);
    const many = computeCreditCost(10, 300, AUTOCLIP_PRICING_DEFAULTS);
    expect(many).toBeGreaterThan(one);
  });

  it("rounds partial minutes up (a 61s total duration costs for 2 minutes)", () => {
    const cost = computeCreditCost(1, 61, AUTOCLIP_PRICING_DEFAULTS);
    expect(cost).toBe(AUTOCLIP_PRICING_DEFAULTS.base + AUTOCLIP_PRICING_DEFAULTS.perMinute * 2);
  });

  it("respects custom admin-configured rates", () => {
    const custom = { base: 5, perExtraClip: 2, perMinute: 3, rerender: 1 };
    expect(computeCreditCost(3, 90, custom)).toBe(5 + 2 * 2 + 3 * 2); // 2 extra clips, 2 minutes
  });
});

describe("getAutoClipPricing", () => {
  it("returns defaults when no Config row exists", async () => {
    configRow = null;
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });

  it("merges a partial admin-set Config row over the defaults", async () => {
    configRow = { key: "autoclip_pricing", value: JSON.stringify({ base: 3 }) };
    expect(await getAutoClipPricing()).toEqual({ ...AUTOCLIP_PRICING_DEFAULTS, base: 3 });
  });

  it("falls back to defaults if the stored Config value is corrupt JSON", async () => {
    configRow = { key: "autoclip_pricing", value: "{not valid json" };
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });
});

describe("buildBrollFilterComplex", () => {
  it("builds three labeled segments (main, broll, main) plus a concat", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("[va]");
    expect(fc).toContain("[vb]");
    expect(fc).toContain("[vc]");
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

  it("uses the same static crop formula on both main segments for a given aspect", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "16:9", null, null);
    const matches = fc.match(/crop=in_w:in_w\*9\/16/g) ?? [];
    expect(matches.length).toBe(2); // segment A and segment C
  });
});
