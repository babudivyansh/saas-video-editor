import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5: per-stage metrics. There was no instrumentation of any kind before
// this, which made every performance claim in the pipeline unfalsifiable —
// including the "GPU is 1.3-2x, not 5-10x" estimate the routing defaults act
// on. These tests guard the two properties that matter: the numbers are right,
// and collecting them can never break the thing being measured.

const store = new Map<string, string[]>();

vi.mock("@/lib/redis", () => ({
  redis: {
    // Mirrors the real capped-ring semantics: push, then trim to maxLen.
    pipelineRingPush: vi.fn(async (key: string, value: string, maxLen: number) => {
      const list = store.get(key) ?? [];
      list.unshift(value);
      store.set(key, list.slice(0, maxLen));
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) =>
      (store.get(key) ?? []).slice(start, stop + 1)),
  },
}));

import { recordStage, timeStage, summariseStage } from "./pipeline-metrics";

beforeEach(() => store.clear());

describe("recordStage", () => {
  it("stores a sample that summarises back out", async () => {
    await recordStage({ stage: "render", ms: 1200, at: Date.now(), ok: true });
    const summary = await summariseStage("render");
    expect(summary?.count).toBe(1);
    expect(summary?.p50Ms).toBe(1200);
  });

  it("returns null for a stage with no samples rather than fake zeros", async () => {
    expect(await summariseStage("upload")).toBeNull();
  });
});

describe("timeStage", () => {
  it("returns the wrapped value and records a success", async () => {
    const value = await timeStage("select", async () => "picked");
    expect(value).toBe("picked");
    const summary = await summariseStage("select");
    expect(summary?.count).toBe(1);
    expect(summary?.failureRatePct).toBe(0);
  });

  // A stage that is only slow when it fails is exactly what aggregate timing
  // hides, so failures are timed too — and the error still propagates.
  it("records a failure and rethrows", async () => {
    await expect(timeStage("transcribe", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const summary = await summariseStage("transcribe");
    expect(summary?.count).toBe(1);
    expect(summary?.failureRatePct).toBe(100);
  });

  // Metrics must cost strictly less than the thing they measure.
  it("does not break the pipeline when Redis is unavailable", async () => {
    const { redis } = await import("@/lib/redis");
    vi.mocked(redis.pipelineRingPush).mockRejectedValueOnce(new Error("redis down"));
    await expect(timeStage("render", async () => "ok")).resolves.toBe("ok");
  });
});

describe("summariseStage", () => {
  it("computes percentiles across samples", async () => {
    for (const ms of [100, 200, 300, 400, 5000]) {
      await recordStage({ stage: "render", ms, at: Date.now(), ok: true });
    }
    const summary = await summariseStage("render");
    expect(summary?.p50Ms).toBe(300);
    expect(summary?.p95Ms).toBe(5000);
  });

  it("splits counts by render target, which is what makes CPU vs GPU comparable", async () => {
    await recordStage({ stage: "render", ms: 100, at: Date.now(), ok: true, target: "cpu" });
    await recordStage({ stage: "render", ms: 80, at: Date.now(), ok: true, target: "gpu" });
    await recordStage({ stage: "render", ms: 90, at: Date.now(), ok: true, target: "gpu" });
    const summary = await summariseStage("render");
    expect(summary?.byTarget).toEqual({ cpu: 1, gpu: 2 });
  });

  it("totals attributable provider cost", async () => {
    await recordStage({ stage: "transcribe", ms: 10, at: Date.now(), ok: true, costUsd: 0.012 });
    await recordStage({ stage: "transcribe", ms: 10, at: Date.now(), ok: true, costUsd: 0.008 });
    expect((await summariseStage("transcribe"))?.totalCostUsd).toBeCloseTo(0.02, 4);
  });

  it("survives a corrupt sample instead of losing the whole stage", async () => {
    store.set("metrics:autoclip:render", ["not json", JSON.stringify({ stage: "render", ms: 50, at: 1, ok: true })]);
    const summary = await summariseStage("render");
    expect(summary?.count).toBe(1);
  });
});
