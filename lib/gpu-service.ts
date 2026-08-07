// Client for the GPU media service — one container that serves two workloads:
// active-speaker detection (Light-ASD) during analysis, and NVENC encoding
// during render. See gpu-service/README.md for the container itself.
//
// The service is a PURE MEDIA FUNCTION: presigned S3 URL in, presigned S3 URL
// out. It holds no AWS credentials, never talks to Postgres or Redis, and is
// never told which user a job belongs to. That is what makes it safe to run on
// rented, ephemeral GPU capacity.
//
// Shape is deliberately the same submit/poll pair as lib/fal.ts — that pattern
// is already in production here, and the hosted-GPU queue APIs (RunPod's
// /run + /status) fit it exactly.

import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { createHmac } from "crypto";

export type GpuJobKind = "asd" | "render";

/**
 * How a GPU job failed, which decides what the caller does next:
 *  - "transport": the service was unreachable, timed out, or errored on its
 *    own account. The same work will very likely succeed on CPU — fall back.
 *  - "input": the job itself is bad (unreadable source, invalid filtergraph).
 *    It will fail identically on CPU, so don't waste a second render.
 *  - "internal": our own bug (bad request shape, auth). Treated as transport
 *    for fallback purposes but logged loudly.
 */
export type GpuErrorClass = "transport" | "input" | "internal";

export class GpuServiceError extends Error {
  constructor(message: string, readonly errorClass: GpuErrorClass) {
    super(message);
    this.name = "GpuServiceError";
  }
}

export function isGpuConfigured(): boolean {
  return Boolean(env.GPU_SERVICE_URL && env.GPU_SERVICE_TOKEN);
}

// ── Circuit breaker ─────────────────────────────────────────────────────────
// Without this, a GPU outage costs every queued clip a full poll deadline
// before it falls back — 200 clips x minutes of waiting. After N consecutive
// transport failures the breaker opens and resolveRenderTarget stops even
// attempting a submit until it closes.

const BREAKER_KEY = "gpu:breaker";
const BREAKER_FAILS_KEY = "gpu:breaker:fails";
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_SEC = 10 * 60;

export async function isBreakerOpen(): Promise<boolean> {
  try {
    return (await redis.get(BREAKER_KEY)) !== null;
  } catch {
    return false; // Redis being down is not a reason to disable the GPU path
  }
}

async function recordFailure(): Promise<void> {
  try {
    const fails = await redis.incrWithExpire(BREAKER_FAILS_KEY, BREAKER_OPEN_SEC);
    if (fails >= BREAKER_THRESHOLD) {
      await redis.set(BREAKER_KEY, "1", "EX", BREAKER_OPEN_SEC);
      logger.error("gpu-service", `circuit breaker OPEN after ${fails} consecutive transport failures`);
    }
  } catch { /* non-fatal */ }
}

async function recordSuccess(): Promise<void> {
  try { await redis.del(BREAKER_FAILS_KEY); } catch { /* non-fatal */ }
}

// ── Request signing ─────────────────────────────────────────────────────────
// The hosting provider's own API key protects the submit endpoint; this HMAC
// additionally proves the request came from US, so a leaked provider key can't
// be used to feed forged results into the pipeline. The timestamp window makes
// captured requests non-replayable.

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(env.GPU_SERVICE_API_KEY ? { Authorization: `Bearer ${env.GPU_SERVICE_API_KEY}` } : {}),
  };
}

/**
 * Signs the job input and returns it with `_ts`/`_sig` embedded.
 *
 * The signature travels INSIDE the payload rather than in a header on purpose:
 * serverless GPU providers hand the handler only the JSON body, so a header
 * signature would be stripped by the platform before the container ever sees
 * it. Embedding it means the same check works whether the container is behind
 * a provider's queue or hosted directly.
 */
function signInput(input: Record<string, unknown>): Record<string, unknown> {
  const ts = Math.floor(Date.now() / 1000);
  // Sign the canonical JSON of the unsigned input; the handler recomputes this
  // over the same fields (excluding _ts/_sig) and compares.
  const payload = JSON.stringify(input, Object.keys(input).sort());
  const sig = createHmac("sha256", env.GPU_SERVICE_TOKEN ?? "").update(`${ts}.${payload}`).digest("hex");
  return { ...input, _ts: ts, _sig: sig };
}

interface GpuJobResponse<T> {
  status: "COMPLETED" | "FAILED" | "IN_PROGRESS" | "IN_QUEUE";
  output?: T;
  error?: { class?: GpuErrorClass; message?: string } | string;
}

async function submit(kind: GpuJobKind, input: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify({ input: signInput({ kind, ...input }) });
  const res = await withRetry(
    (signal) => fetch(`${env.GPU_SERVICE_URL}/run`, { method: "POST", headers: authHeaders(), body, signal }),
    { timeoutMs: 20_000 },
  );
  if (!res.ok) {
    throw new GpuServiceError(`submit failed ${res.status}: ${(await res.text()).slice(0, 500)}`, "transport");
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new GpuServiceError("submit returned no job id", "internal");
  return data.id;
}

function toError(err: GpuJobResponse<unknown>["error"]): GpuServiceError {
  if (typeof err === "string") return new GpuServiceError(err, "transport");
  return new GpuServiceError(err?.message ?? "GPU job failed", err?.class ?? "transport");
}

async function poll<T>(jobId: string, deadlineMs: number, pollIntervalMs: number): Promise<T> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    let res: Response;
    try {
      res = await fetch(`${env.GPU_SERVICE_URL}/status/${jobId}`, { headers: authHeaders() });
    } catch {
      continue; // transient network blip — keep polling until the deadline
    }
    if (!res.ok) continue;
    const data = (await res.json()) as GpuJobResponse<T>;
    if (data.status === "COMPLETED") {
      if (data.output === undefined) throw new GpuServiceError("job completed with no output", "internal");
      return data.output;
    }
    if (data.status === "FAILED") throw toError(data.error);
  }
  throw new GpuServiceError(`GPU job ${jobId} timed out after ${deadlineMs}ms`, "transport");
}

async function runGpuJob<T>(
  kind: GpuJobKind,
  input: Record<string, unknown>,
  opts: { deadlineMs: number; pollIntervalMs?: number },
): Promise<T> {
  if (!isGpuConfigured()) throw new GpuServiceError("GPU service is not configured", "transport");
  try {
    const jobId = await submit(kind, input);
    const out = await poll<T>(jobId, opts.deadlineMs, opts.pollIntervalMs ?? 2000);
    await recordSuccess();
    return out;
  } catch (err) {
    const e = err instanceof GpuServiceError ? err : new GpuServiceError(String(err), "transport");
    // Only transport-class failures count toward the breaker: a malformed
    // input would otherwise trip it and disable GPU for everyone.
    if (e.errorClass !== "input") await recordFailure();
    throw e;
  }
}

// ── Workload: active-speaker detection ──────────────────────────────────────

export interface AsdSample {
  t: number;
  x: number; y: number; w: number; h: number; // frame fractions, same basis as FaceBox
  conf: number;
  speaking: number; // 0..1
}
export interface AsdTrack { trackId: string; samples: AsdSample[] }
export interface AsdResult { version: number; srcW: number; srcH: number; tracks: AsdTrack[] }

export function runAsd(videoUrl: string, opts?: { sampleFps?: number; deadlineMs?: number }): Promise<AsdResult> {
  return runGpuJob<AsdResult>(
    "asd",
    { videoUrl, sampleFps: opts?.sampleFps ?? 5 },
    // ASD runs inside pickJob, which already spends minutes on transcription
    // and Gemini, so a generous deadline (and a cold start) costs nothing
    // user-visible.
    { deadlineMs: opts?.deadlineMs ?? 20 * 60 * 1000, pollIntervalMs: 3000 },
  );
}

// ── Workload: NVENC render ──────────────────────────────────────────────────

export interface GpuRenderInput {
  /** Presigned GET for the source video. */
  sourceUrl: string;
  /** Presigned PUT the service writes the finished mp4 to. */
  outputPutUrl: string;
  /** Complete ffmpeg argument list, minus the binary, input and output paths. */
  args: string[];
  /** Optional extra inputs (B-roll, subtitle files) as { name, url } pairs. */
  extraInputs?: { name: string; url: string }[];
  startSec?: number;
  endSec?: number;
}

export interface GpuRenderResult { durationSec: number; bytes: number; encodeSec: number }

export function runGpuRender(input: GpuRenderInput, opts?: { deadlineMs?: number }): Promise<GpuRenderResult> {
  return runGpuJob<GpuRenderResult>("render", input as unknown as Record<string, unknown>, {
    deadlineMs: opts?.deadlineMs ?? 15 * 60 * 1000,
    pollIntervalMs: 2000,
  });
}

/** Liveness probe for the admin ops page — distinguishes "our dispatcher is
 * alive" (which the existing worker heartbeat already proves) from "the GPU
 * service is actually reachable", which it does not. */
export async function gpuHealth(): Promise<{ configured: boolean; reachable: boolean; breakerOpen: boolean }> {
  const configured = isGpuConfigured();
  const breakerOpen = await isBreakerOpen();
  if (!configured) return { configured, reachable: false, breakerOpen };
  try {
    const res = await withRetry(
      (signal) => fetch(`${env.GPU_SERVICE_URL}/health`, { headers: authHeaders(), signal }),
      { timeoutMs: 8000, maxAttempts: 1 },
    );
    return { configured, reachable: res.ok, breakerOpen };
  } catch {
    return { configured, reachable: false, breakerOpen };
  }
}
