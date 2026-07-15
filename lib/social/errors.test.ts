import { describe, expect, it, vi } from "vitest";
import { ProviderApiError, classifyError, withRetry } from "./errors";

describe("classifyError", () => {
  it("classifies 401 as auth", () => {
    expect(classifyError(new ProviderApiError("x", 401))).toBe("auth");
  });

  it("classifies Meta OAuthException (code 190 in a 400 body) as auth", () => {
    const body = JSON.stringify({ error: { type: "OAuthException", code: 190, message: "token expired" } });
    expect(classifyError(new ProviderApiError("x", 400, body))).toBe("auth");
  });

  it("classifies 429 and 5xx as retryable", () => {
    expect(classifyError(new ProviderApiError("x", 429))).toBe("retryable");
    expect(classifyError(new ProviderApiError("x", 503))).toBe("retryable");
  });

  it("classifies 400/403 without auth markers and non-API errors as permanent", () => {
    expect(classifyError(new ProviderApiError("x", 400, '{"error":"bad param"}'))).toBe("permanent");
    expect(classifyError(new ProviderApiError("x", 403))).toBe("permanent");
    expect(classifyError(new Error("plain"))).toBe("permanent");
  });
});

describe("withRetry", () => {
  it("retries retryable errors and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ProviderApiError("x", 503))
      .mockRejectedValueOnce(new ProviderApiError("x", 429))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry auth errors", async () => {
    const fn = vi.fn().mockRejectedValue(new ProviderApiError("x", 401));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget", async () => {
    const fn = vi.fn().mockRejectedValue(new ProviderApiError("x", 500));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
