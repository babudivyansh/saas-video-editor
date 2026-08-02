// Graph API batch requests.
//
// WHY THIS EXISTS. syncInstagram and syncFacebook used to fetch per-media
// insights inside a Promise.all over the post list, so a 100-post backfill fired
// 100 concurrent Graph calls. That is exactly the pattern Meta's Business Use
// Case rate limiter exists to stop, and the limit applies APP-WIDE — one user's
// backfill degraded every user's sync. Batching turns 100 posts into 2 HTTP
// calls.
//
// A batch is not a transaction: sub-requests succeed and fail independently, so
// every result is returned as a discriminated union rather than throwing. One
// post whose insights are unavailable must not lose the other 49.

import { ProviderApiError } from "./errors";

/** Meta's hard ceiling on sub-requests per batch. */
export const MAX_BATCH_SIZE = 50;

export interface BatchRequest {
  method: "GET";
  /** Path relative to the Graph root, without a leading slash. */
  relative_url: string;
}

export type BatchResult<T> = { ok: true; body: T } | { ok: false; error: string; status: number };

interface RawBatchEntry {
  code: number;
  body: string;
}

/**
 * POST a batch of GET sub-requests. Chunks automatically, and returns results in
 * the SAME ORDER as the input — callers index into this by position, so the
 * ordering guarantee is load-bearing.
 */
export async function graphBatch<T>(
  graphRoot: string,
  requests: BatchRequest[],
  token: string,
): Promise<Array<BatchResult<T>>> {
  if (requests.length === 0) return [];

  const out: Array<BatchResult<T>> = [];
  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    const chunk = requests.slice(i, i + MAX_BATCH_SIZE);
    out.push(...(await runChunk<T>(graphRoot, chunk, token)));
  }
  return out;
}

async function runChunk<T>(
  graphRoot: string,
  chunk: BatchRequest[],
  token: string,
): Promise<Array<BatchResult<T>>> {
  const body = new URLSearchParams({
    access_token: token,
    // include_headers=false keeps the response small; we only need code + body.
    include_headers: "false",
    batch: JSON.stringify(chunk),
  });

  const res = await fetch(graphRoot, { method: "POST", body });

  // A transport-level failure fails the whole chunk. Distinct from a
  // sub-request failure, and worth surfacing as a provider error so
  // classifyError can decide whether to retry.
  if (!res.ok) {
    throw new ProviderApiError(
      `meta batch failed: ${res.status}`,
      res.status,
      await res.text().catch(() => ""),
    );
  }

  let entries: Array<RawBatchEntry | null>;
  try {
    entries = (await res.json()) as Array<RawBatchEntry | null>;
  } catch {
    throw new ProviderApiError("meta batch returned malformed JSON", res.status, "");
  }

  if (!Array.isArray(entries)) {
    throw new ProviderApiError("meta batch returned an unexpected shape", res.status, "");
  }

  return chunk.map((_, index) => parseEntry<T>(entries[index]));
}

function parseEntry<T>(entry: RawBatchEntry | null | undefined): BatchResult<T> {
  // Meta returns null for a sub-request that timed out inside the batch.
  if (!entry) return { ok: false, error: "sub-request timed out", status: 504 };

  if (entry.code < 200 || entry.code >= 300) {
    return { ok: false, error: extractError(entry.body), status: entry.code };
  }

  try {
    return { ok: true, body: JSON.parse(entry.body) as T };
  } catch {
    return { ok: false, error: "malformed sub-response body", status: entry.code };
  }
}

/** Pull Graph's `error.message` out of a failed sub-response body. */
function extractError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: number } };
    if (parsed.error?.message) {
      return parsed.error.code != null
        ? `${parsed.error.message} (code ${parsed.error.code})`
        : parsed.error.message;
    }
  } catch {
    /* fall through to the raw body */
  }
  // Bounded: a provider error body is not a place to let arbitrary length into
  // our logs or into lastSyncError.
  return body.slice(0, 200) || "unknown error";
}

/** Convenience: keep only successful bodies, discarding failures. */
export function successfulBodies<T>(results: Array<BatchResult<T>>): T[] {
  return results.filter((r): r is { ok: true; body: T } => r.ok).map((r) => r.body);
}

/**
 * Whether enough of a batch failed to call the whole sync partial. A handful of
 * posts missing insights is normal (deleted media, stories past their window);
 * most of them failing means something is actually wrong.
 */
export function batchMostlyFailed(results: Array<BatchResult<unknown>>, threshold = 0.5): boolean {
  if (results.length === 0) return false;
  return results.filter((r) => !r.ok).length / results.length > threshold;
}
