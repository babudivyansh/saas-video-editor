import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./with-retry";

describe("withRetry", () => {
  it("retries every error by default (unchanged behavior for existing callers)", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    });
    const result = await withRetry(fn, { timeoutMs: 1000, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("stops immediately on a non-retryable error when isRetryable says so", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new Error("permanent");
    });
    await expect(
      withRetry(fn, { timeoutMs: 1000, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow("permanent");
    expect(calls).toBe(1);
  });

  it("keeps retrying a retryable error up to maxAttempts", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      throw new Error("retryable");
    });
    await expect(
      withRetry(fn, { timeoutMs: 1000, baseDelayMs: 1, maxAttempts: 3, isRetryable: () => true }),
    ).rejects.toThrow("retryable");
    expect(calls).toBe(3);
  });

  it("honors retryDelayMs over the default exponential backoff", async () => {
    const delays: number[] = [];
    const realSetTimeout = global.setTimeout;
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (ms && ms > 0 && ms !== 1000) delays.push(ms); // ignore the per-attempt abort timer (timeoutMs)
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);

    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("retry-with-custom-delay");
      return "ok";
    });

    await withRetry(fn, { timeoutMs: 1000, baseDelayMs: 500, isRetryable: () => true, retryDelayMs: () => 42 });
    expect(delays).toContain(42);

    vi.restoreAllMocks();
  });
});
