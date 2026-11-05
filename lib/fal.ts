import { fal } from "@fal-ai/client";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";

// The one fal.ai queue client: upload an input, submit a job, poll it to
// completion, cancel it. Used by the image generator, background remover,
// face swap and vocal remover.
//
// Three bugs it exists to prevent (2026-11 audit, all four tools were affected):
// - Uploads went to `https://storage.fal.run`, a host that does not exist
//   (DNS ENOTFOUND). Every background-remover and vocal-remover job failed at
//   its first step. Uploads now go through the official client's
//   `fal.storage.upload`, which uses fal's REST storage API.
// - Status/result URLs were built from the full endpoint id. For an id with a
//   sub-path (`fal-ai/imageutils/rembg`, `fal-ai/ideogram/v4/fast`, …) fal's
//   queue answers those URLs with 405, and the poll loop skipped non-OK
//   answers without a word until its deadline. The queue only knows
//   `<owner>/<alias>`. The URLs fal returns on submit are used when present;
//   the fallback drops the sub-path the same way the official client does.
// - Cancelling a job only refunded it: fal kept running, and billing, the
//   request. `falCancel` now tells fal to stop.

export function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

/** A submitted fal queue request and the URLs to follow it. */
export interface FalRequest {
  endpoint: string;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  cancelUrl: string;
}

const NAMESPACES = ["workflows", "comfy"];

/**
 * The queue base URL for an endpoint id: `https://queue.fal.run/<owner>/<alias>`,
 * without any sub-path. Mirrors `parseEndpointId` in `@fal-ai/client`.
 */
export function falQueueBase(endpoint: string): string {
  const parts = endpoint.replace(/^\/+|\/+$/g, "").split("/");
  const app = NAMESPACES.includes(parts[0]) ? parts.slice(0, 3) : parts.slice(0, 2);
  return `https://queue.fal.run/${app.join("/")}`;
}

/** The status, result and cancel URLs for a request: fal's own when it sent them. */
export function falRequestUrls(
  endpoint: string,
  requestId: string,
  fromSubmit?: { status_url?: unknown; response_url?: unknown; cancel_url?: unknown },
): Omit<FalRequest, "endpoint" | "requestId"> {
  const base = `${falQueueBase(endpoint)}/requests/${requestId}`;
  const str = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v : null);
  return {
    statusUrl: str(fromSubmit?.status_url) ?? `${base}/status`,
    responseUrl: str(fromSubmit?.response_url) ?? base,
    cancelUrl: str(fromSubmit?.cancel_url) ?? `${base}/cancel`,
  };
}

/** Upload bytes to fal's storage and return a URL a fal model can read. */
export async function falUpload(buffer: Buffer, mimeType: string): Promise<string> {
  fal.config({ credentials: env.FAL_KEY });
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  try {
    return await uploadWithRetry(blob);
  } catch (e) {
    // The client's ApiError says only "Forbidden"; the reason ("User is
    // locked. Reason: Exhausted balance.") is in its body. Keep it, so the
    // Generation's errorMessage and Sentry say what actually happened.
    const err = e as { status?: unknown; body?: { detail?: unknown } } | null;
    if (typeof err?.status === "number") {
      const detail = err.body?.detail;
      throw new Error(`fal.ai upload failed ${err.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail ?? (e as Error).message)}`, { cause: e });
    }
    throw e;
  }
}

function uploadWithRetry(blob: Blob): Promise<string> {
  return withRetry(
    // The client takes no AbortSignal, so the timeout races it instead.
    (signal) => new Promise<string>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      fal.storage.upload(blob).then(resolve, reject);
    }),
    {
      timeoutMs: 60_000,
      // A 4xx (bad key, locked account, file rejected) won't change on retry.
      isRetryable: (err) => {
        const status = (err as { status?: unknown })?.status;
        return !(typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429);
      },
    },
  );
}

export async function falSubmit(endpoint: string, input: Record<string, unknown>): Promise<FalRequest> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    }),
    { timeoutMs: 15_000 },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai submit error ${res.status}: ${txt}`);
  }
  const data = await res.json() as { request_id?: unknown; status_url?: unknown; response_url?: unknown; cancel_url?: unknown };
  if (typeof data.request_id !== "string" || !data.request_id) {
    throw new Error("fal.ai submit returned no request_id");
  }
  return { endpoint, requestId: data.request_id, ...falRequestUrls(endpoint, data.request_id, data) };
}

/** Thrown by `falPollUntilDone` when its signal is aborted (the job was cancelled). */
export class FalCancelledError extends Error {
  constructor() {
    super("fal.ai request cancelled");
    this.name = "FalCancelledError";
  }
}

// Status answers that will never turn into a COMPLETED: a wrong URL (404/405),
// bad credentials (401/403), a locked account. Retrying them only delays the
// failure to the deadline.
function isPermanentStatusError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
const MAX_PERMANENT_STATUS_ERRORS = 3;

export async function falPollUntilDone(
  req: FalRequest,
  opts?: { deadlineMs?: number; pollIntervalMs?: number; signal?: AbortSignal },
): Promise<unknown> {
  const deadline = Date.now() + (opts?.deadlineMs ?? 12 * 60 * 1000);
  const pollIntervalMs = opts?.pollIntervalMs ?? 5000;
  let permanentErrors = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    if (opts?.signal?.aborted) throw new FalCancelledError();
    // A stalled poll counts as a missed one; the loop deadline still applies.
    const statusRes = await fetch(req.statusUrl, {
      headers: falAuth(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT.api),
    }).catch(() => null);
    if (!statusRes) continue;
    if (!statusRes.ok) {
      if (!isPermanentStatusError(statusRes.status)) continue;
      // A few in a row, not one: fal can briefly 404 a request it has only
      // just queued.
      if (++permanentErrors >= MAX_PERMANENT_STATUS_ERRORS) {
        const txt = await statusRes.text().catch(() => "");
        throw new Error(`fal.ai status check failed ${statusRes.status}: ${txt.slice(0, 300)}`);
      }
      continue;
    }
    permanentErrors = 0;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(req.responseUrl, {
        headers: falAuth(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT.api),
      });
      if (!resultRes.ok) {
        const txt = await resultRes.text().catch(() => "");
        throw new Error(`fal.ai result fetch failed ${resultRes.status}: ${txt.slice(0, 300)}`);
      }
      return resultRes.json();
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "fal.ai generation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("fal.ai generation timed out");
}

/** Best-effort: ask fal to stop a queued or running request. Never throws. */
export async function falCancel(req: FalRequest): Promise<void> {
  try {
    await fetch(req.cancelUrl, {
      method: "PUT",
      headers: falAuth(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT.api),
    });
  } catch { /* the request just runs to completion */ }
}

// Walks each dot-path (e.g. "images.0.url") against the raw FAL result JSON in
// order, returning the first one that resolves to a non-empty string — result
// shapes vary per model (result.video.url, result.images[0].url, result.image.url, ...).
export function extractResultUrl(raw: unknown, resultPath: string[]): string {
  for (const path of resultPath) {
    let cur: unknown = raw;
    for (const segment of path.split(".")) {
      if (cur == null || typeof cur !== "object") { cur = undefined; break; }
      cur = (cur as Record<string, unknown>)[segment];
    }
    if (typeof cur === "string" && cur.length > 0) return cur;
  }
  throw new Error(`No result URL found in fal.ai response at path(s): ${resultPath.join(", ")}`);
}
