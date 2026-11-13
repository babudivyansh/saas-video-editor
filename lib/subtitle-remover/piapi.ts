// PiAPI "remove-subtitle" (model Qubico/video-toolkit): finds burned-in text
// anywhere in the frame and fills the background behind it. Contract from
// https://piapi.ai/docs/tools/video-remove-subtitle-api (checked 2026-11-14):
//   POST /api/v1/task  { model, task_type, input: { video, region? } }  header x-api-key
//   GET  /api/v1/task/{id} -> data.status, data.output.video_url, data.error
// Input limits: one regular MP4 (not fragmented, no rotation metadata), one
// video track, 1-600 s, at most 60 MiB, fetched from a public http(s) URL.
// Price: $0.006 per source second, rounded up; failed tasks are not charged.

import { withRetry } from "@/lib/with-retry";

const BASE = "https://api.piapi.ai/api/v1";

export const PIAPI_MAX_BYTES = 60 * 1024 * 1024;
export const PIAPI_MAX_SEC = 600;
export const PIAPI_USD_PER_SEC = 0.006;

export type PiapiStatus = "pending" | "staged" | "processing" | "retry" | "completed" | "failed" | "canceled" | "unknown";

export interface PiapiTask {
  taskId: string;
  status: PiapiStatus;
  videoUrl: string | null;
  errorMessage: string | null;
}

export class PiapiError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "PiapiError";
  }
}

function parseTask(json: unknown): PiapiTask {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data.task_id !== "string") throw new PiapiError("PiAPI returned no task");
  const output = data.output as { video_url?: unknown } | null | undefined;
  const error = data.error as { code?: unknown; message?: unknown } | null | undefined;
  return {
    taskId: data.task_id,
    status: (typeof data.status === "string" ? data.status : "unknown") as PiapiStatus,
    videoUrl: typeof output?.video_url === "string" ? output.video_url : null,
    errorMessage: error && error.code && typeof error.message === "string" && error.message ? error.message : null,
  };
}

async function call(apiKey: string, path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal,
    headers: { "x-api-key": apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = (json as { message?: unknown } | null)?.message;
    throw new PiapiError(`PiAPI ${res.status}: ${typeof msg === "string" && msg ? msg : text.slice(0, 200)}`, res.status);
  }
  return json;
}

// 4xx is our input (bad URL, too big, bad region): retrying can't help and a
// retried create could start a second paid task.
const retryable = (err: unknown) => !(err instanceof PiapiError && err.httpStatus != null && err.httpStatus < 500);

/** Starts a task. `region` in source-video pixels, or omitted for automatic detection. */
export async function createRemoveSubtitleTask(
  apiKey: string,
  videoUrl: string,
  region?: { x: number; y: number; width: number; height: number },
): Promise<PiapiTask> {
  const body = {
    model: "Qubico/video-toolkit",
    task_type: "remove-subtitle",
    input: region ? { video: videoUrl, region } : { video: videoUrl },
  };
  // One attempt only: a create that timed out may still have started a task.
  const json = await withRetry(
    (signal) => call(apiKey, "/task", { method: "POST", body: JSON.stringify(body) }, signal),
    { timeoutMs: 30_000, maxAttempts: 1 },
  );
  return parseTask(json);
}

export async function getTask(apiKey: string, taskId: string): Promise<PiapiTask> {
  const json = await withRetry(
    (signal) => call(apiKey, `/task/${encodeURIComponent(taskId)}`, { method: "GET" }, signal),
    { timeoutMs: 20_000, maxAttempts: 3, isRetryable: retryable },
  );
  return parseTask(json);
}

const TERMINAL: PiapiStatus[] = ["completed", "failed", "canceled"];

/**
 * Polls until the task finishes. Resolves with the output URL; throws on
 * failure, on timeout, or as soon as `shouldStop()` says the job was cancelled.
 */
export async function waitForTask(
  apiKey: string,
  taskId: string,
  opts: { timeoutMs: number; intervalMs?: number; shouldStop?: () => boolean; onStatus?: (s: PiapiStatus, elapsedMs: number) => void; sleep?: (ms: number) => Promise<void> },
): Promise<string> {
  const interval = opts.intervalMs ?? 5_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = Date.now();
  for (;;) {
    if (opts.shouldStop?.()) throw new PiapiError("cancelled");
    const task = await getTask(apiKey, taskId);
    opts.onStatus?.(task.status, Date.now() - started);
    if (TERMINAL.includes(task.status)) {
      if (task.status === "completed" && task.videoUrl) return task.videoUrl;
      throw new PiapiError(`PiAPI task ${task.status}${task.errorMessage ? `: ${task.errorMessage}` : ""}`);
    }
    if (Date.now() - started > opts.timeoutMs) throw new PiapiError(`PiAPI task still ${task.status} after ${Math.round(opts.timeoutMs / 60000)} min`);
    await sleep(interval);
  }
}

/** Only fetch results from PiAPI over https; never a private or plain-http address it might hand back. */
export function isSafeResultUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // Literal IPs: refuse private, loopback and link-local ranges.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (host.startsWith("[")) return false;
  return true;
}
