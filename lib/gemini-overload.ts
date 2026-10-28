// Gemini capacity spikes: "503 … This model is currently experiencing high
// demand" (or a 429). They are not bad requests and usually clear within
// seconds to a minute, but AutoClip's pick step retried once after 500ms and
// the job's own three retries landed in the same spike, so a whole run died
// in ~75s (Sentry CLIPIRO-WEB-E -> -C, 2026-10-28).
//
// Here an overload gets a real backoff, and if the primary model stays
// overloaded the call moves to a fallback model, which has separate capacity.
// Anything else keeps the old behaviour: one retry, then fail.

import { withRetry } from "@/lib/with-retry";

/** True for Gemini's "try again later" responses (503 / 429), from the SDK's error or its message. */
export function isGeminiOverloaded(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 503 || status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\[(503|429)\b/.test(message) || /high demand|overloaded/i.test(message);
}

export interface OverloadFallbackOptions<T> {
  /** One generation call against the named model; pass `signal` through to the SDK. */
  call: (model: string, signal: AbortSignal) => Promise<T>;
  primary: string;
  fallback: string;
  timeoutMs: number;
  /** Waits between overloaded attempts on the primary; its length + 1 is the attempt budget. */
  primaryBackoffMs?: number[];
  /** Waits between overloaded attempts on the fallback. */
  fallbackBackoffMs?: number[];
  /** Told when the fallback takes over (for logging). */
  onFallback?: (err: unknown) => void;
}

function attempt<T>(model: string, backoffMs: number[], opts: OverloadFallbackOptions<T>): Promise<T> {
  let otherFailures = 0;
  return withRetry((signal) => opts.call(model, signal), {
    timeoutMs: opts.timeoutMs,
    maxAttempts: backoffMs.length + 1,
    // Overloads use the whole budget; anything else (a timeout, a network
    // error) gets the single retry it always had.
    isRetryable: (err) => isGeminiOverloaded(err) || ++otherFailures < 2,
    retryDelayMs: (err, n) => (isGeminiOverloaded(err) ? backoffMs[n - 1] : undefined),
  });
}

export async function generateWithOverloadFallback<T>(opts: OverloadFallbackOptions<T>): Promise<T> {
  try {
    return await attempt(opts.primary, opts.primaryBackoffMs ?? [4_000, 12_000, 30_000], opts);
  } catch (err) {
    if (!isGeminiOverloaded(err)) throw err;
    opts.onFallback?.(err);
    return attempt(opts.fallback, opts.fallbackBackoffMs ?? [5_000, 15_000], opts);
  }
}
