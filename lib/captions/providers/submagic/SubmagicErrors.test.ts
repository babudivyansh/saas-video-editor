import { describe, it, expect } from "vitest";
import {
  SubmagicError,
  classifyHttpStatus,
  classifyTransportError,
  isRetryable,
  userMessageFor,
} from "./SubmagicErrors";

describe("classifyHttpStatus", () => {
  it("treats auth and validation failures as permanent for both call kinds", () => {
    for (const kind of ["read", "paid"] as const) {
      expect(classifyHttpStatus(401, "UNAUTHORIZED", kind).errorClass).toBe("permanent");
      expect(classifyHttpStatus(400, "VALIDATION_ERROR", kind).errorClass).toBe("permanent");
      expect(classifyHttpStatus(404, "NOT_FOUND", kind).errorClass).toBe("permanent");
    }
  });

  it("treats 429 as safe to retry even for a paid call", () => {
    // Being rate limited means the request was rejected before doing anything,
    // so there is no side effect to be uncertain about.
    expect(classifyHttpStatus(429, undefined, "paid")).toMatchObject({
      errorClass: "safe_to_retry",
      code: "RATE_LIMITED",
    });
  });

  it("splits 5xx by call kind — this is the double-charge guard", () => {
    // A read can simply be repeated. A paid call may have been committed before
    // the server failed to answer, so repeating it could mint (and bill for) a
    // second provider project.
    expect(classifyHttpStatus(500, undefined, "read").errorClass).toBe("safe_to_retry");
    expect(classifyHttpStatus(500, undefined, "paid").errorClass).toBe("unknown_provider_state");
    expect(classifyHttpStatus(503, undefined, "paid").errorClass).toBe("unknown_provider_state");
  });

  it("does not guess in the expensive direction for an unexpected status", () => {
    expect(classifyHttpStatus(418, undefined, "paid").errorClass).toBe("unknown_provider_state");
    expect(classifyHttpStatus(418, undefined, "read").errorClass).toBe("safe_to_retry");
  });
});

describe("classifyTransportError", () => {
  it("marks a paid call with no response at all as unknown, not failed", () => {
    const err = classifyTransportError(new Error("socket hang up"), "paid");
    expect(err.errorClass).toBe("unknown_provider_state");
    expect(err.code).toBe("TRANSPORT");
  });

  it("marks the same failure on a read as retryable", () => {
    expect(classifyTransportError(new Error("ETIMEDOUT"), "read").errorClass).toBe("safe_to_retry");
  });

  it("never leaks the original error object, only its message", () => {
    const err = classifyTransportError(new Error("key=sk-secret"), "read");
    expect(err).toBeInstanceOf(SubmagicError);
    expect(err.message).toContain("key=sk-secret"); // internal only; see userMessageFor
  });
});

describe("isRetryable", () => {
  it("retries ONLY the provably safe class", () => {
    expect(isRetryable(new SubmagicError("x", "safe_to_retry"))).toBe(true);
    expect(isRetryable(new SubmagicError("x", "permanent"))).toBe(false);
    // The important one: an unknown provider state must never be auto-retried,
    // because a retry is how one paid render becomes two.
    expect(isRetryable(new SubmagicError("x", "unknown_provider_state"))).toBe(false);
  });

  it("does not retry a non-Submagic error it can't reason about", () => {
    expect(isRetryable(new Error("boom"))).toBe(false);
  });
});

describe("userMessageFor", () => {
  it("never exposes raw provider text", () => {
    const msg = userMessageFor(
      new SubmagicError("submagic POST /v1/projects -> 401 UNAUTHORIZED", "permanent", "UNAUTHORIZED", 401),
    );
    expect(msg).toBe("Premium caption rendering is temporarily unavailable.");
    expect(msg).not.toMatch(/submagic|401|UNAUTHORIZED/i);
  });

  it("does not tell the user that OUR credentials are wrong", () => {
    // An auth failure is our configuration problem, not something the user can
    // act on, so it reads as a temporary outage.
    expect(userMessageFor(new SubmagicError("x", "permanent", "UNAUTHORIZED"))).not.toMatch(/key|auth|credential/i);
  });

  it("gives an actionable message for an unsupported clip", () => {
    expect(userMessageFor(new SubmagicError("x", "permanent", "VALIDATION_ERROR"))).toMatch(/clip format/i);
  });

  it("falls back to a safe sentence for an unknown error", () => {
    expect(userMessageFor(new Error("boom"))).toMatch(/credits have been returned/i);
  });
});
