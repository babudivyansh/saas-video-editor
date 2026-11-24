// REGRESSION — every production AutoClip run ended with `reframe_failed`.
//
// Production has no GPU active-speaker service (GPU_SERVICE_URL unset) and the
// Rekognition fallback is off for cost, so getFaceTimeline returned
// { boxes: [], failure: "unconfigured" } for every source: each clip was a
// centre crop and a gaming stream lost its facecam (2026-11-23, 66 of 66 runs
// in 30 days). The resolver now ends with Gemini on sampled frames of the
// local source file.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { boxes: unknown[]; failure?: string };

const runAsd = vi.hoisted(() => vi.fn(async () => ({ tracks: [] as never[] })));
vi.mock("@/lib/gpu-service", () => ({
  runAsd,
  GpuServiceError: class extends Error { errorClass = "transport"; },
}));

const detectFaceTimeline = vi.hoisted(() => vi.fn(async (): Promise<Result> => ({ boxes: [], failure: "unconfigured" })));
vi.mock("@/lib/reframe", () => ({ detectFaceTimeline }));

const shouldUseAsd = vi.hoisted(() => vi.fn(async () => false));
const shouldUseRekognitionFallback = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@/lib/render-target", () => ({ shouldUseAsd, shouldUseRekognitionFallback }));

const classifySource = vi.hoisted(() => vi.fn(async (): Promise<{ kind: string; url?: string }> => ({ kind: "owned", url: "https://signed.invalid/v.mp4" })));
vi.mock("@/lib/source-url", () => ({ classifySource }));

// The foreign-media refusal logs an error, and the real logger lazy-loads
// Sentry on its first error: >5s when several test files import at once.
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const GEMINI_FACE = { tSec: 1.5, x: 0.86, y: 0.08, w: 0.05, h: 0.09, confidence: 90 };
const detectFacesWithGemini = vi.hoisted(() => vi.fn(async (): Promise<Result> => ({ boxes: [] })));
vi.mock("@/lib/face-detect-gemini", () => ({ detectFacesWithGemini }));

const { getFaceTimeline } = await import("@/lib/asd");

const OWNED = "https://bucket.s3.region.amazonaws.com/uploads/u1/v.mp4";
const LOCAL = { path: "/tmp/src.mp4", durationSec: 600 };

describe("getFaceTimeline with no GPU service and the Rekognition fallback off (production)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseAsd.mockResolvedValue(false);
    shouldUseRekognitionFallback.mockResolvedValue(false);
    classifySource.mockResolvedValue({ kind: "owned", url: "https://signed.invalid/v.mp4" });
    detectFacesWithGemini.mockResolvedValue({ boxes: [GEMINI_FACE] });
  });

  it("detects faces with Gemini on the local file instead of failing", async () => {
    const r = await getFaceTimeline("u1", OWNED, LOCAL);
    expect(detectFacesWithGemini).toHaveBeenCalledWith(LOCAL.path, LOCAL.durationSec);
    expect(detectFaceTimeline).not.toHaveBeenCalled(); // Rekognition stays off: cost gate
    expect(r).toEqual({ boxes: [GEMINI_FACE] });
  });

  it("falls through to Gemini when ASD is configured but down", async () => {
    shouldUseAsd.mockResolvedValue(true);
    runAsd.mockRejectedValueOnce(new Error("gpu down"));
    const r = await getFaceTimeline("u1", OWNED, LOCAL);
    expect(r).toEqual({ boxes: [GEMINI_FACE] });
  });

  it("falls through to Gemini when Rekognition is on but fails (e.g. IAM denies it)", async () => {
    shouldUseRekognitionFallback.mockResolvedValue(true);
    const r = await getFaceTimeline("u1", OWNED, LOCAL);
    expect(detectFaceTimeline).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ boxes: [GEMINI_FACE] });
  });

  it("keeps the failure when Gemini cannot run either, so it is still reported", async () => {
    detectFacesWithGemini.mockResolvedValueOnce({ boxes: [], failure: "error" });
    const r = await getFaceTimeline("u1", OWNED, LOCAL);
    expect(r).toEqual({ boxes: [], failure: "error" });
  });

  it("still refuses foreign media before any detector runs", async () => {
    classifySource.mockResolvedValueOnce({ kind: "foreign" });
    const r = await getFaceTimeline("u1", OWNED, LOCAL);
    expect(detectFacesWithGemini).not.toHaveBeenCalled();
    expect(r.failure).toBe("unconfigured");
  });

  it("has no Gemini rung without a local file", async () => {
    const r = await getFaceTimeline("u1", OWNED);
    expect(detectFacesWithGemini).not.toHaveBeenCalled();
    expect(r).toEqual({ boxes: [], failure: "unconfigured" });
  });
});
