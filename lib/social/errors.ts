// Error classification + retry for provider API calls. Providers throw
// ProviderApiError from their HTTP helpers so the sync engine can distinguish
// "reconnect needed" from "try again later" from "genuinely broken".

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}

export type ErrorClass = "auth" | "retryable" | "permanent";

// 401 always means the token is dead. Meta reports expired/invalidated tokens
// as 400 with an OAuthException (code 190), so sniff the body for that too.
// 429 and 5xx are worth retrying; everything else is a real bug or a
// permissions gap that retrying won't fix.
export function classifyError(e: unknown): ErrorClass {
  if (!(e instanceof ProviderApiError)) return "permanent";
  if (e.status === 401) return "auth";
  if (e.body && /"code"\s*:\s*190|OAuthException/.test(e.body) && e.status < 500) return "auth";
  if (e.status === 429 || e.status >= 500) return "retryable";
  return "permanent";
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

// Exponential backoff with full jitter, retrying only errors classified
// retryable. Auth/permanent errors surface immediately.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (classifyError(e) !== "retryable" || i === attempts - 1) throw e;
      const delay = Math.random() * base * 2 ** i;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
