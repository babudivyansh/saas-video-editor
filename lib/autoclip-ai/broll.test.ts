import { describe, expect, it, vi, beforeEach } from "vitest";

// Modules under test reach lib/env at import time (via lib/reframe and the
// ffmpeg helpers); none of these tests needs a real value.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

// The generators are stubbed so this file tests only the selection rules.
const generateImageBroll = vi.fn();
const submitVideoBroll = vi.fn();
vi.mock("@/lib/autoclip-ai/broll-generate", async (orig) => ({
  ...(await orig<typeof import("@/lib/autoclip-ai/broll-generate")>()),
  generateImageBroll: (...a: unknown[]) => generateImageBroll(...a),
  submitVideoBroll: (...a: unknown[]) => submitVideoBroll(...a),
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}) } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveClipBroll, type BrollRunContext } from "@/lib/autoclip-ai/broll-select";
import { cutawayPrompt, motionExprs, motionFor, stillMotionArgs, IMAGE_SIZE, STILL_MOTIONS } from "@/lib/autoclip-ai/broll-generate";
import { brollRequestsFor } from "@/lib/autoclip-ai/run";
import { AUTOCLIP_AI_DEFAULTS, mergeAutoClipAiConfig, NO_AI_FEATURES, resolveAiFeatures } from "@/lib/autoclip-ai/config-shared";
import { AiBudget } from "@/lib/autoclip-ai/budget";
import { EMPTY_SIGNAL_TRACK } from "@/lib/signal-track";
import { isAllowedStockHost } from "@/lib/stock-hosts";

const IMG = "https://test-bucket.s3.us-east-1.amazonaws.com/broll/u1/p1/img.mp4";

function ctx(over: Partial<BrollRunContext> = {}): BrollRunContext {
  return {
    cfg: mergeAutoClipAiConfig(null),
    features: { ...NO_AI_FEATURES, brollGenerateImage: true },
    budget: new AiBudget(1),
    aspect: "9:16", userId: "u1", projectId: "p1", allowAiVideo: false,
    ...over,
  };
}
const req = (startSec: number) => ({ startSec, endSec: startSec + 2.5, queries: ["city skyline at night, aerial view"], sentence: "the city never sleeps", reaction: false });
const clip = { index: 0, startSec: 0, endSec: 30 };

beforeEach(() => {
  generateImageBroll.mockReset();
  submitVideoBroll.mockReset();
});

describe("generated B-roll is the default", () => {
  it("is on for every plan with no config row; everything else stays off", () => {
    for (const tier of ["free", "creator", "pro", "studio"] as const) {
      const f = resolveAiFeatures(mergeAutoClipAiConfig(null), tier);
      expect(f.brollGenerateImage).toBe(true);
      expect(f.brollGenerateVideo).toBe(false);
      expect(f.editPlan).toBe(false);
    }
  });

  it("caps inserts per clip at 3 and accepts 0 to switch them off", () => {
    expect(AUTOCLIP_AI_DEFAULTS.broll.maxGeneratedPerClip).toBe(3);
    expect(mergeAutoClipAiConfig({ v: 2, broll: { maxGeneratedPerClip: 9 } }).broll.maxGeneratedPerClip).toBe(3);
    expect(mergeAutoClipAiConfig({ v: 2, broll: { maxGeneratedPerClip: 0 } }).broll.maxGeneratedPerClip).toBe(0);
  });

  it("only allows third-party B-roll downloads from fal (and Pexels, for clips made before)", () => {
    expect(isAllowedStockHost("v3.fal.media", "broll")).toBe(true);
    expect(isAllowedStockHost("videos.pexels.com", "broll")).toBe(true);
    expect(isAllowedStockHost("cdn.pixabay.com", "broll")).toBe(false);
    expect(isAllowedStockHost("media.giphy.com", "broll")).toBe(false);
  });
});

describe("resolveClipBroll", () => {
  it("generates a still for every window, with a different camera move each", async () => {
    generateImageBroll.mockResolvedValue(IMG);
    const r = await resolveClipBroll(ctx(), clip, [req(8), req(16)]);
    expect(r.windows.map((w) => w.provider)).toEqual(["ai_image", "ai_image"]);
    expect(r.windows.map((w) => w.url)).toEqual([IMG, IMG]);
    const motions = generateImageBroll.mock.calls.map((c) => (c[0] as { motion: string }).motion);
    expect(new Set(motions).size).toBe(2);
    expect(r.decisions.every((d) => d.provider === "ai_image")).toBe(true);
  });

  it("stops at the per-clip limit", async () => {
    generateImageBroll.mockResolvedValue(IMG);
    const r = await resolveClipBroll(ctx({ cfg: mergeAutoClipAiConfig({ v: 2, broll: { maxGeneratedPerClip: 1 } }) }), clip, [req(5), req(12), req(20)]);
    expect(r.windows).toHaveLength(1);
    expect(generateImageBroll).toHaveBeenCalledTimes(1);
  });

  it("leaves a window empty when generation fails, without failing the others", async () => {
    generateImageBroll.mockResolvedValueOnce(null).mockResolvedValueOnce(IMG);
    const r = await resolveClipBroll(ctx(), clip, [req(5), req(15)]);
    expect(r.windows).toHaveLength(1);
    expect(r.decisions.map((d) => d.provider)).toEqual([null, "ai_image"]);
  });

  it("makes no B-roll at all when generation is off for the tier", async () => {
    const r = await resolveClipBroll(ctx({ features: { ...NO_AI_FEATURES } }), clip, [req(5)]);
    expect(r).toEqual({ windows: [], decisions: [] });
    expect(generateImageBroll).not.toHaveBeenCalled();
  });

  it("uses AI video only for a user who opted in, and falls back to a still if it can't submit", async () => {
    const features = { ...NO_AI_FEATURES, brollGenerateImage: true, brollGenerateVideo: true };
    submitVideoBroll.mockResolvedValueOnce({ endpoint: "fal-ai/ltx-video", requestId: "r1", statusUrl: "s", responseUrl: "r", cancelUrl: "c" });
    const vid = await resolveClipBroll(ctx({ features, allowAiVideo: true }), clip, [req(5)]);
    expect(vid.windows[0]).toMatchObject({ provider: "ai_video", url: "", pending: { requestId: "r1" } });

    submitVideoBroll.mockResolvedValueOnce(null);
    generateImageBroll.mockResolvedValue(IMG);
    const fallback = await resolveClipBroll(ctx({ features, allowAiVideo: true }), clip, [req(5)]);
    expect(fallback.windows[0].provider).toBe("ai_image");

    submitVideoBroll.mockClear();
    await resolveClipBroll(ctx({ features, allowAiVideo: false }), clip, [req(5)]);
    expect(submitVideoBroll).not.toHaveBeenCalled();
  });
});

describe("still-to-clip motion", () => {
  it("cycles through every move", () => {
    expect(new Set([0, 1, 2, 3].map((i) => motionFor(i, 0)))).toEqual(new Set(STILL_MOTIONS));
  });

  it("push-in grows, pull-out shrinks, pans hold the zoom and travel", () => {
    expect(motionExprs("push_in", 90).z).toBe("1+0.10*(on/90)");
    expect(motionExprs("pull_out", 90).z).toBe("1.10-0.10*(on/90)");
    expect(motionExprs("pan_right", 90)).toMatchObject({ z: "1.08", x: "(iw-iw/zoom)*(on/90)" });
    expect(motionExprs("pan_left", 90).x).toBe("(iw-iw/zoom)*(1-(on/90))");
  });

  it("renders at the clip's own size, silent, for the requested length", () => {
    const args = stillMotionArgs("in.png", "out.mp4", "9:16", 3, "pan_left");
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("s=1080x1920");
    expect(vf).toContain("d=90");
    expect(args).toContain("-an");
    expect(args[args.indexOf("-t") + 1]).toBe("3.00");
  });

  it("asks for ~1MP stills in the clip's shape, and prompts out text and faces", () => {
    expect(IMAGE_SIZE["9:16"].width / IMAGE_SIZE["9:16"].height).toBeCloseTo(9 / 16, 1);
    for (const s of Object.values(IMAGE_SIZE)) {
      expect(s.width % 16).toBe(0);
      expect(s.height % 16).toBe(0);
    }
    const p = cutawayPrompt(["city skyline at night"], "the city never sleeps");
    expect(p.startsWith("city skyline at night.")).toBe(true);
    expect(p).toContain("No text");
    expect(p).toContain("no close-up human faces");
  });
});

describe("brollRequestsFor", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({ word: `w${i}`, start: i * 500, end: i * 500 + 400 }));
  const input = { index: 0, start: 100, end: 130, title: "t", words, signal: EMPTY_SIGNAL_TRACK, brollCues: [], brollQuery: "sunrise over a harbour", brollOffsetSec: 8 };

  it("prefers the edit plan's windows", () => {
    const plan = { v: 1 as const, zooms: [], resets: [], layout: null, broll: [{ startSec: 5, endSec: 7, queries: ["q"], sentence: "s", reaction: false }] };
    expect(brollRequestsFor(input, plan)).toEqual([{ startSec: 5, endSec: 7, queries: ["q"], sentence: "s", reaction: false }]);
  });

  it("falls back to the clip pick's suggestion", () => {
    const r = brollRequestsFor(input, null);
    expect(r).toHaveLength(1);
    expect(r[0].queries).toEqual(["sunrise over a harbour"]);
    expect(r[0].sentence.length).toBeGreaterThan(0);
  });
});
