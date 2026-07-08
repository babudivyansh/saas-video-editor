export interface RetryOptions {
  /** Max attempts including the first — default 3. */
  maxAttempts?: number;
  /** Hard per-attempt timeout in ms — the request is actually aborted, not just abandoned. */
  timeoutMs: number;
  /** Base delay for exponential backoff between attempts — default 500ms. */
  baseDelayMs?: number;
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
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new RetryTimeoutError(opts.timeoutMs)), opts.timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
