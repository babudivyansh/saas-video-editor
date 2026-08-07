// Per-stage timing and cost for the AutoClip pipeline.
//
// There was previously NO instrumentation of any kind here: the only signals
// were `logger` calls on failure and the whole-Generation start/finish
// timestamps in the admin dashboard. That makes every performance claim
// unfalsifiable — including the "GPU rendering is 1.3-2x, not 5-10x" estimate
// this codebase now acts on. You cannot tune what you cannot see.
//
// Deliberately lightweight: a Redis list per stage with a bounded length, not
// a metrics vendor. It answers "which stage is slow and what does a run cost"
// without adding a dependency or a bill.

import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export type PipelineStage =
  | "download" | "transcribe" | "select" | "faces" | "signal"
  | "render" | "upload" | "lite" | "preview";

export interface StageSample {
  stage: PipelineStage;
  ms: number;
  at: number;
  /** "cpu" | "gpu" for render stages. */
  target?: string;
  /** Provider spend attributable to this stage, in USD. */
  costUsd?: number;
  ok: boolean;
  /** Free-form dimensions — clip count, source minutes, bytes out. */
  meta?: Record<string, number | string | boolean>;
}

const KEY = (stage: PipelineStage) => `metrics:autoclip:${stage}`;
const MAX_SAMPLES = 500;
const TTL_SEC = 14 * 24 * 3600;

/**
 * Record one stage sample. Never throws and never blocks the pipeline: losing
 * a metric must cost strictly less than the thing being measured.
 */
export async function recordStage(sample: StageSample): Promise<void> {
  try {
    const key = KEY(sample.stage);
    await redis.lpush(key, JSON.stringify(sample));
    await redis.ltrim(key, 0, MAX_SAMPLES - 1);
    await redis.expire(key, TTL_SEC);
  } catch {
    /* metrics are best-effort by design */
  }
}

/**
 * Time an async stage and record it, returning whatever it returned.
 * Failures are recorded too — a stage that's slow only when it fails is
 * exactly the kind of thing aggregate timing hides.
 */
export async function timeStage<T>(
  stage: PipelineStage,
  fn: () => Promise<T>,
  meta?: Omit<StageSample, "stage" | "ms" | "at" | "ok">,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    void recordStage({ stage, ms: Date.now() - started, at: started, ok: true, ...meta });
    return result;
  } catch (err) {
    void recordStage({ stage, ms: Date.now() - started, at: started, ok: false, ...meta });
    throw err;
  }
}

export interface StageSummary {
  stage: PipelineStage;
  count: number;
  p50Ms: number;
  p95Ms: number;
  failureRatePct: number;
  totalCostUsd: number;
  byTarget: Record<string, number>;
}

/** Aggregate recent samples for the admin ops view. */
export async function summariseStage(stage: PipelineStage): Promise<StageSummary | null> {
  try {
    const raw = await redis.lrange(KEY(stage), 0, MAX_SAMPLES - 1);
    if (!raw || raw.length === 0) return null;

    const samples = raw
      .map((r) => { try { return JSON.parse(r) as StageSample; } catch { return null; } })
      .filter((s): s is StageSample => s !== null);
    if (samples.length === 0) return null;

    const durations = samples.map((s) => s.ms).sort((a, b) => a - b);
    const at = (p: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
    const failures = samples.filter((s) => !s.ok).length;

    const byTarget: Record<string, number> = {};
    for (const s of samples) if (s.target) byTarget[s.target] = (byTarget[s.target] ?? 0) + 1;

    return {
      stage,
      count: samples.length,
      p50Ms: at(0.5),
      p95Ms: at(0.95),
      failureRatePct: Math.round((failures / samples.length) * 1000) / 10,
      totalCostUsd: Math.round(samples.reduce((sum, s) => sum + (s.costUsd ?? 0), 0) * 10_000) / 10_000,
      byTarget,
    };
  } catch (err) {
    logger.warn("pipeline-metrics", `failed to summarise ${stage}`, err);
    return null;
  }
}

export const ALL_STAGES: PipelineStage[] = [
  "download", "transcribe", "select", "faces", "signal", "render", "upload", "lite", "preview",
];

export async function summariseAllStages(): Promise<StageSummary[]> {
  const all = await Promise.all(ALL_STAGES.map(summariseStage));
  return all.filter((s): s is StageSummary => s !== null);
}
