// Deadlines for outbound calls that don't go through withRetry
// (lib/with-retry.ts) — non-idempotent POSTs, poll loops, and media transfers.
// Without one, a vendor that accepts the connection and then stalls holds the
// request (or the background job, which shares the web process) open until
// the platform kills it.

export const FETCH_TIMEOUT = {
  /** A JSON API call or a single status poll. */
  api: 30_000,
  /** OAuth token exchange, userinfo, signing certs: someone is waiting on a redirect. */
  auth: 15_000,
  /** A whole media file read into memory or uploaded, start to finish. */
  transfer: 10 * 60_000,
} as const;

/**
 * fetch() that aborts if the response headers haven't arrived within `ms`.
 * The body itself is not time-limited — for responses streamed straight on
 * to the client, where a large file legitimately takes minutes.
 */
export async function fetchHeadersWithin(input: string | URL, ms: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException(`No response within ${ms}ms`, "TimeoutError")),
    ms,
  );
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
