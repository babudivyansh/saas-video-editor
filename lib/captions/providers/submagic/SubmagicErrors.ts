// Failure classification for Submagic calls.
//
// The whole point of this file is the third class. Rendering costs money, so
// "the request failed" and "we don't know whether the request succeeded" are
// completely different situations and must not share a retry policy:
//
//   Clipiro POSTs /v1/projects
//     -> Submagic creates the project and starts billing
//     -> the response is lost (timeout, socket reset, our process dies)
//     -> Clipiro concludes "create failed"
//     -> Clipiro retries
//     -> a SECOND provider project exists, and the user is billed twice.
//
// So a create/export that fails without a decisive HTTP status becomes
// UNKNOWN_PROVIDER_STATE, the job moves to `needs_reconciliation`, and
// lib/cron/submagic-sweep.ts asks the provider what actually happened before
// anything is allowed to spend again.
//
// Same three-way shape as GpuServiceError in lib/gpu-service.ts, which already
// uses classification to decide fall-back-vs-give-up.

/**
 *  - "safe_to_retry":      decisively failed, no provider-side effect. Retry.
 *  - "permanent":          will fail identically forever (bad key, bad input).
 *                          Never retry; surface a user-facing message.
 *  - "unknown_provider_state": we cannot prove whether a PAID side effect
 *                          happened. Never blindly retry; reconcile first.
 */
export type SubmagicErrorClass = "safe_to_retry" | "permanent" | "unknown_provider_state";

/** Error codes Submagic actually returns (verified against the live API). */
export type SubmagicErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TRANSPORT"
  | "UNKNOWN";

export class SubmagicError extends Error {
  constructor(
    message: string,
    readonly errorClass: SubmagicErrorClass,
    readonly code: SubmagicErrorCode = "UNKNOWN",
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "SubmagicError";
  }
}

/**
 * Whether a call may have had a paid side effect if it fails inconclusively.
 * Reads are always safe; creates and exports are not.
 */
export type SubmagicCallKind = "read" | "paid";

/**
 * Classifies a non-2xx response.
 *
 * 5xx is the interesting case: for a read it is simply retryable, but for a
 * paid call the provider may have committed the work before failing to answer,
 * so it is unknown rather than retryable.
 */
export function classifyHttpStatus(
  status: number,
  bodyCode: string | undefined,
  kind: SubmagicCallKind,
): { errorClass: SubmagicErrorClass; code: SubmagicErrorCode } {
  if (status === 401 || status === 403) {
    return { errorClass: "permanent", code: "UNAUTHORIZED" };
  }
  if (status === 400 || status === 422) {
    return { errorClass: "permanent", code: "VALIDATION_ERROR" };
  }
  if (status === 404) {
    return { errorClass: "permanent", code: "NOT_FOUND" };
  }
  if (status === 429) {
    // Rate limiting never creates anything, so it's safe even for a paid call.
    return { errorClass: "safe_to_retry", code: "RATE_LIMITED" };
  }
  if (status >= 500) {
    return {
      errorClass: kind === "paid" ? "unknown_provider_state" : "safe_to_retry",
      code: bodyCode === "UNAUTHORIZED" ? "UNAUTHORIZED" : "TRANSPORT",
    };
  }
  // Any other non-2xx: don't guess in the expensive direction.
  return {
    errorClass: kind === "paid" ? "unknown_provider_state" : "safe_to_retry",
    code: "UNKNOWN",
  };
}

/**
 * Classifies a thrown transport error (DNS, socket reset, abort/timeout).
 *
 * For a read this is plainly retryable. For a paid call we never saw a
 * response, so we cannot know whether the provider committed — unknown.
 */
export function classifyTransportError(err: unknown, kind: SubmagicCallKind): SubmagicError {
  const message = err instanceof Error ? err.message : String(err);
  return new SubmagicError(
    `submagic transport failure: ${message}`,
    kind === "paid" ? "unknown_provider_state" : "safe_to_retry",
    "TRANSPORT",
  );
}

/** Only `safe_to_retry` is ever retried automatically (§23). */
export function isRetryable(err: unknown): boolean {
  return err instanceof SubmagicError && err.errorClass === "safe_to_retry";
}

// ── User-facing messages (§39) ──────────────────────────────────────────────
// Raw provider JSON never reaches a client. Detailed context stays in
// logger.error -> Sentry. Mirrors lib/editor/render-failure.ts's split between
// an internal category and a sentence written for a creator.

const USER_MESSAGES: Record<SubmagicErrorCode, string> = {
  UNAUTHORIZED: "Premium caption rendering is temporarily unavailable.",
  TRANSPORT: "Premium caption rendering is temporarily unavailable.",
  RATE_LIMITED: "Caption rendering is busy right now — please try again in a few minutes.",
  VALIDATION_ERROR: "This clip format can't be rendered with the selected caption style.",
  NOT_FOUND: "This caption render is no longer available. Please start a new one.",
  UNKNOWN: "Caption rendering didn't finish. Your credits have been returned.",
};

export function userMessageFor(err: unknown): string {
  if (err instanceof SubmagicError) return USER_MESSAGES[err.code] ?? USER_MESSAGES.UNKNOWN;
  return USER_MESSAGES.UNKNOWN;
}
