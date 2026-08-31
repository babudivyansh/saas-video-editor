export interface RetryOptions {
  /** Max attempts including the first — default 3. */
  maxAttempts?: number;
  /** Hard per-attempt timeout in ms — the request is actually aborted, not just abandoned. */
  timeoutMs: number;
  /** Base delay for exponential backoff between attempts — default 500ms. */
  baseDelayMs?: number;
  /**
   * Classifies a thrown error as worth another attempt. Default: retry
   * everything (unchanged behavior for every existing caller) — pass this
   * when `fn` can throw something that will never succeed by retrying, e.g.
   * a non-2xx HTTP response wrapped in a typed error by the caller.
   */
  isRetryable?: (err: unknown) => boolean;
  /**
   * Override the backoff delay for a specific error (e.g. honor a
   * provider's `Retry-After` header) instead of the default exponential
   * backoff. Return undefined to fall back to the default for that attempt.
   */
  retryDelayMs?: (err: unknown, attempt: number) => number | undefined;
}

export class RetryTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = "RetryTimeoutError";
  }
}

/**
 * Wraps an async provider call (fetch, an SDK method that accepts an
 * AbortSignal, etc.) with exponential backoff and a hard per-attempt timeout.
 * `fn` receives the AbortSignal so callers pass it straight through
 * (`fetch(url, { signal })`, `model.generateContent(prompt, { signal })`) so
 * the underlying request is actually cancelled on timeout.
 */
export async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, opts: RetryOptions): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const isRetryable = opts.isRetryable ?? (() => true);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new RetryTimeoutError(opts.timeoutMs)), opts.timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) break;
      const delay = opts.retryDelayMs?.(err, attempt) ?? baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
