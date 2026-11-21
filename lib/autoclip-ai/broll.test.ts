import { describe, expect, it, vi, beforeEach } from "vitest";

// Modules under test reach lib/env at import time (via lib/reframe and the
// ffmpeg helpers); none of these tests needs a real value.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

// broll-select pulls in providers, ranker and generators; each is stubbed so
// this file tests only the selection rules.
const searchStockPool = vi.fn();
vi.mock("@/lib/autoclip-ai/broll-sources", async (orig) => ({
  ...(await orig<typeof import("@/lib/autoclip-ai/broll-sources")>()),
  searchStockPool: (...a: unknown[]) => searchStockPool(...a),
}));
const rankWithGeminiVision = vi.fn();
const rankWithEmbeddings = vi.fn();
vi.mock("@/lib/autoclip-ai/broll-rank", async (orig) => ({
  ...(await orig<typeof import("@/lib/autoclip-ai/broll-rank")>()),
  rankWithGeminiVision: (...a: unknown[]) => rankWithGeminiVision(...a),
  rankWithEmbeddings: (...a: unknown[]) => rankWithEmbeddings(...a),
}));
const generateImageBroll = vi.fn();
const submitVideoBroll = vi.fn();
vi.mock("@/lib/autoclip-ai/broll-generate", () => ({
  generateImageBroll: (...a: unknown[]) => generateImageBroll(...a),
  submitVideoBroll: (...a: unknown[]) => submitVideoBroll(...a),
  materializeSourceCutaway: vi.fn(async () => "https://bucket.s3.us-east-1.amazonaws.com/broll/u1/p1/x.mp4"),
}));
const pickBroll = vi.fn();
vi.mock("@/lib/broll", async (orig) => ({
  ...(await orig<typeof import("@/lib/broll")>()),
  pickBroll: (...a: unknown[]) => pickBroll(...a),
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}) } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveClipBroll, sourceCandidatesFor, type BrollRunContext } from "@/lib/autoclip-ai/broll-select";
import { pickWinner, cosine, siglipScore } from "@/lib/autoclip-ai/broll-rank";
import { mapPixabayHits, mapCoverrHits, dedupeCandidates, type BrollCandidate } from "@/lib/autoclip-ai/broll-sources";
import { brollRequestsFor } from "@/lib/autoclip-ai/run";
import { mergeAutoClipAiConfig, NO_AI_FEATURES } from "@/lib/autoclip-ai/config-shared";
import { AiBudget } from "@/lib/autoclip-ai/budget";
import { EMPTY_SIGNAL_TRACK } from "@/lib/signal-track";

const cand = (provider: BrollCandidate["provider"], id: string): BrollCandidate => ({
  provider, externalId: id, preview: { url: `https://images.pexels.com/${id}.jpg` }, downloadUrl: `https://videos.pexels.com/${id}.mp4`,
  width: 1080, height: 1920, durationSec: 8,
});

function ctx(over: Partial<BrollRunContext> = {}): BrollRunContext {
  return {
    cfg: mergeAutoClipAiConfig(null),
    features: { ...NO_AI_FEATURES, brollRank: true },
    budget: new AiBudget(1),
    aspect: "9:16", userId: "u1", projectId: "p1", videoPath: "/tmp/src.mp4",
    used: new Set(), library: [], sourcePool: [], allowAiVideo: false,
    ...over,
  };
}
const req = { startSec: 4, endSec: 6.5, queries: ["city traffic at night"], sentence: "the city never sleeps", reaction: false };

beforeEach(() => {
  [searchStockPool, rankWithGeminiVision, rankWithEmbeddings, generateImageBroll, submitVideoBroll, pickBroll].forEach((m) => m.mockReset());
});

describe("pickWinner", () => {
  it("takes the best score above the threshold, with the library bonus, skipping used inserts", () => {
    const pool = [cand("pexels", "a"), cand("library", "b"), cand("pixabay", "c")];
    expect(pickWinner(pool, [70, 65, 72], { threshold: 60, libraryBonus: 8, used: new Set() })?.candidate.externalId).toBe("b");
    expect(pickWinner(pool, [70, 65, 72], { threshold: 60, libraryBonus: 8, used: new Set(["library:b"]) })?.candidate.externalId).toBe("c");
    expect(pickWinner(pool, [50, null, 40], { threshold: 60, libraryBonus: 8, used: new Set() })).toBeNull();
  });

  it("scores embeddings with SigLIP's sigmoid", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(siglipScore(0, 10, 0)).toBe(50);
    expect(siglipScore(0.3, 10, -10)).toBeLessThan(siglipScore(0.9, 10, -10));
  });
});

describe("provider mappers", () => {
  it("maps Pixabay hits and skips ones without a still", () => {
    const out = mapPixabayHits([
      { id: 1, duration: 9, user: "ann", videos: { medium: { url: "https://cdn.pixabay.com/v/1.mp4", width: 1280, height: 720, thumbnail: "https://cdn.pixabay.com/v/1.jpg" } } },
      { id: 2, duration: 9, user: "bob", videos: { medium: { url: "https://cdn.pixabay.com/v/2.mp4", width: 1280, height: 720 } } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ provider: "pixabay", externalId: "1", attribution: "Video by ann on Pixabay" });
  });

  it("maps Coverr hits and dedupes across queries", () => {
    const out = mapCoverrHits([{ id: "x", duration: 10, thumbnail: "https://cdn.coverr.co/x.jpg", urls: { mp4_download: "https://cdn.coverr.co/x.mp4" } }]);
    expect(out[0].downloadUrl).toBe("https://cdn.coverr.co/x.mp4");
    expect(dedupeCandidates([...out, ...out])).toHaveLength(1);
  });
});

describe("resolveClipBroll", () => {
  it("with ranking off is the old behaviour: the first Pexels result", async () => {
    pickBroll.mockResolvedValue({ downloadUrl: "https://videos.pexels.com/1.mp4" });
    const r = await resolveClipBroll(ctx({ features: { ...NO_AI_FEATURES } }), { index: 0, startSec: 0, endSec: 30 }, [req]);
    expect(r.windows).toEqual([{ startSec: 4, endSec: 6.5, url: "https://videos.pexels.com/1.mp4", query: "city traffic at night", provider: "pexels" }]);
    expect(searchStockPool).not.toHaveBeenCalled();
  });

  it("uses the ranker's winner and never reuses it in the same run", async () => {
    searchStockPool.mockResolvedValue([cand("pexels", "a"), cand("pixabay", "b")]);
    rankWithGeminiVision.mockResolvedValue({ scores: [55, 90], why: "shows traffic" });
    const c = ctx();
    const first = await resolveClipBroll(c, { index: 0, startSec: 0, endSec: 30 }, [req]);
    expect(first.windows[0]).toMatchObject({ provider: "pixabay", url: "https://videos.pexels.com/b.mp4" });
    expect(first.decisions[0]).toMatchObject({ provider: "pixabay", score: 90, why: "shows traffic" });
    const second = await resolveClipBroll(c, { index: 1, startSec: 40, endSec: 70 }, [req]);
    expect(second.windows).toEqual([]);
  });

  it("leaves the window empty when nothing clears the bar and generation is off", async () => {
    searchStockPool.mockResolvedValue([cand("pexels", "a")]);
    rankWithGeminiVision.mockResolvedValue({ scores: [30], why: null });
    const r = await resolveClipBroll(ctx(), { index: 0, startSec: 0, endSec: 30 }, [req]);
    expect(r.windows).toEqual([]);
    expect(r.decisions[0].provider).toBeNull();
    expect(generateImageBroll).not.toHaveBeenCalled();
  });

  it("falls back to a generated still, then a video only when the user opted in", async () => {
    searchStockPool.mockResolvedValue([]);
    rankWithGeminiVision.mockResolvedValue(null);
    rankWithEmbeddings.mockResolvedValue(null);
    generateImageBroll.mockResolvedValue("https://bucket.s3.us-east-1.amazonaws.com/broll/u1/p1/img.mp4");
    submitVideoBroll.mockResolvedValue({ endpoint: "fal-ai/ltx-video", requestId: "r1", statusUrl: "s", responseUrl: "r", cancelUrl: "c" });
    const features = { ...NO_AI_FEATURES, brollRank: true, brollGenerateImage: true, brollGenerateVideo: true };

    const img = await resolveClipBroll(ctx({ features }), { index: 0, startSec: 0, endSec: 30 }, [req]);
    expect(img.windows[0].provider).toBe("ai_image");
    expect(submitVideoBroll).not.toHaveBeenCalled();

    const vid = await resolveClipBroll(ctx({ features, allowAiVideo: true }), { index: 0, startSec: 0, endSec: 30 }, [req]);
    expect(vid.windows[0]).toMatchObject({ provider: "ai_video", url: "", pending: { requestId: "r1" } });
  });

  it("never offers a clip its own window as a cutaway", () => {
    const own = { ...cand("source", "s1"), sourceWindow: { startSec: 10, endSec: 14 } };
    const other = { ...cand("source", "s2"), sourceWindow: { startSec: 50, endSec: 54 } };
    expect(sourceCandidatesFor([own, other], 5, 30).map((c) => c.externalId)).toEqual(["s2"]);
  });
});

describe("brollRequestsFor", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({ word: `w${i}`, start: i * 500, end: i * 500 + 400 }));
  const clip = { index: 0, start: 100, end: 130, title: "t", words, signal: EMPTY_SIGNAL_TRACK, brollCues: [], brollQuery: "sunrise", brollOffsetSec: 8 };

  it("prefers the edit plan's windows", () => {
    const plan = { v: 1 as const, zooms: [], resets: [], layout: null, broll: [{ startSec: 5, endSec: 7, queries: ["q"], sentence: "s", reaction: false }] };
    expect(brollRequestsFor(clip, plan)).toEqual([{ startSec: 5, endSec: 7, queries: ["q"], sentence: "s", reaction: false }]);
  });

  it("falls back to the pick's single suggestion", () => {
    const r = brollRequestsFor(clip, null);
    expect(r).toHaveLength(1);
    expect(r[0].queries).toEqual(["sunrise"]);
    expect(r[0].sentence.length).toBeGreaterThan(0);
  });
});
