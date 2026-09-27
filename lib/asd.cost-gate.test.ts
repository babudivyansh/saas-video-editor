// COST REGRESSION — the Rekognition fallback.
//
// Rekognition Video bills $0.10 per minute of the WHOLE source. Before the
// 2026-09 pricing audit it was the automatic fallback whenever ASD produced
// nothing, and the only path free users ever took — a 30-minute free run could
// cost $3 in face detection alone. It now runs only behind
// gpu_routing.rekognitionFallback, which defaults to off.

import { beforeEach, describe, expect, it, vi } from "vitest";

const runAsd = vi.hoisted(() => vi.fn(async () => ({ tracks: [] as never[] })));
vi.mock("@/lib/gpu-service", () => ({
  runAsd,
  GpuServiceError: class extends Error { errorClass = "transport"; },
}));

const detectFaceTimeline = vi.hoisted(() => vi.fn(async () => ({ boxes: [] })));
vi.mock("@/lib/reframe", () => ({ detectFaceTimeline }));

const shouldUseAsd = vi.hoisted(() => vi.fn(async () => true));
const shouldUseRekognitionFallback = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@/lib/render-target", () => ({ shouldUseAsd, shouldUseRekognitionFallback }));

vi.mock("@/lib/source-url", () => ({
  classifySource: vi.fn(async () => ({ kind: "owned", url: "https://signed.invalid/v.mp4" })),
}));

const { getFaceTimeline } = await import("@/lib/asd");
const { GPU_ROUTING_DEFAULTS } = await vi.importActual<typeof import("@/lib/render-target")>("@/lib/render-target");

const OWNED = "https://bucket.s3.region.amazonaws.com/uploads/u1/v.mp4";

describe("Rekognition fallback cost gate", () => {
  beforeEach(() => {
    runAsd.mockClear();
    detectFaceTimeline.mockClear();
    shouldUseAsd.mockResolvedValue(true);
    shouldUseRekognitionFallback.mockResolvedValue(false);
  });

  it("defaults to off, and free is an ASD tier", () => {
    expect(GPU_ROUTING_DEFAULTS.rekognitionFallback).toBe(false);
    expect(GPU_ROUTING_DEFAULTS.asdTiers).toContain("free");
  });

  it("does not call Rekognition when ASD finds nothing and the fallback is off", async () => {
    const r = await getFaceTimeline("u1", OWNED);
    expect(runAsd).toHaveBeenCalledTimes(1);
    expect(detectFaceTimeline).not.toHaveBeenCalled();
    expect(r).toEqual({ boxes: [], failure: "unconfigured" });
  });

  it("does not call Rekognition when ASD is unavailable for the user and the fallback is off", async () => {
    shouldUseAsd.mockResolvedValue(false);
    await getFaceTimeline("u1", OWNED);
    expect(runAsd).not.toHaveBeenCalled();
    expect(detectFaceTimeline).not.toHaveBeenCalled();
  });

  it("does not call Rekognition when ASD throws and the fallback is off", async () => {
    runAsd.mockRejectedValueOnce(new Error("gpu down"));
    await getFaceTimeline("u1", OWNED);
    expect(detectFaceTimeline).not.toHaveBeenCalled();
  });

  it("calls Rekognition for owned media only when an admin turns the fallback on", async () => {
    shouldUseRekognitionFallback.mockResolvedValue(true);
    await getFaceTimeline("u1", OWNED);
    expect(detectFaceTimeline).toHaveBeenCalledTimes(1);
  });
});
