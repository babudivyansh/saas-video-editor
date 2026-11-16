import { describe, expect, it, vi } from "vitest";
import { generateWithOverloadFallback, isGeminiOverloaded } from "./gemini-overload";

// The exact shape production threw (Sentry CLIPIRO-WEB-E).
const overloaded = () =>
  Object.assign(
    new Error(
      "[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    ),
    { status: 503 },
  );

const base = { primary: "flash", fallback: "lite", timeoutMs: 1_000, primaryBackoffMs: [0, 0, 0], fallbackBackoffMs: [0, 0] };

describe("isGeminiOverloaded", () => {
  it("recognises 503/429 by status or by message", () => {
    expect(isGeminiOverloaded(overloaded())).toBe(true);
    expect(isGeminiOverloaded(new Error("[429 Too Many Requests] Resource has been exhausted"))).toBe(true);
    expect(isGeminiOverloaded(new Error("[400 Bad Request] API key not valid"))).toBe(false);
    expect(isGeminiOverloaded(new Error("Request aborted when fetching …"))).toBe(false);
  });
});

describe("generateWithOverloadFallback", () => {
  it("rides out a short spike on the primary model", async () => {
    let n = 0;
    const call = vi.fn(async (model: string) => {
      if (++n < 3) throw overloaded();
      return `ok:${model}`;
    });
    await expect(generateWithOverloadFallback({ ...base, call })).resolves.toBe("ok:flash");
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("moves to the fallback model when the primary stays overloaded", async () => {
    const onFallback = vi.fn();
    const call = vi.fn(async (model: string) => {
      if (model === "flash") throw overloaded();
      return `ok:${model}`;
    });
    await expect(generateWithOverloadFallback({ ...base, call, onFallback })).resolves.toBe("ok:lite");
    expect(call.mock.calls.filter(([m]) => m === "flash")).toHaveLength(4); // whole primary budget
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("gives up after the fallback's budget if everything is overloaded", async () => {
    const call = vi.fn(async () => { throw overloaded(); });
    await expect(generateWithOverloadFallback({ ...base, call })).rejects.toThrow(/high demand/);
    expect(call).toHaveBeenCalledTimes(4 + 3);
  });

  it("keeps the single retry for other errors and never falls back on them", async () => {
    const call = vi.fn(async () => { throw new Error("[400 Bad Request] API key not valid"); });
    await expect(generateWithOverloadFallback({ ...base, call })).rejects.toThrow(/400/);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls.every(([m]) => m === "flash")).toBe(true);
  });

  it("moves a timed-out pick straight to the fallback, reporting the timeout (CLIPIRO-WEB-B)", async () => {
    // A primary that never answers: our timeout aborts it, and the SDK rejects
    // with its own vague "Request aborted" error.
    const call = vi.fn((model: string, signal: AbortSignal) =>
      model === "flash"
        ? new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("[GoogleGenerativeAI Error]: Request aborted when fetching …: This operation was aborted"))))
        : Promise.resolve(`ok:${model}`),
    );
    const onFallback = vi.fn();
    await expect(generateWithOverloadFallback({ ...base, timeoutMs: 20, call, onFallback })).resolves.toBe("ok:lite");
    expect(call.mock.calls.filter(([m]) => m === "flash")).toHaveLength(1); // not retried on the same model
    expect(String(onFallback.mock.calls[0][0])).toMatch(/Timed out after 20ms/);
  });

  it("reports the timeout itself when the fallback times out too", async () => {
    const call = vi.fn((_m: string, signal: AbortSignal) =>
      new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("This operation was aborted")))));
    await expect(generateWithOverloadFallback({ ...base, timeoutMs: 20, call })).rejects.toThrow(/Timed out after 20ms/);
    expect(call).toHaveBeenCalledTimes(2); // one on each model
  });
});
