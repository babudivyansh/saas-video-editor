import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHeadersWithin } from "./fetch-timeout";

// A fetch that resolves only when `respondAfterMs` elapses, and rejects the
// moment its signal aborts — the shape of a real stalled vendor.
function slowFetch(respondAfterMs: number) {
  return vi.fn((_url: string | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response("ok")), respondAfterMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(init.signal!.reason);
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchHeadersWithin", () => {
  it("aborts when the response headers don't arrive in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", slowFetch(60_000));
    const p = fetchHeadersWithin("https://vendor.test/slow", 1_000);
    const assertion = expect(p).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });

  it("leaves the body unbounded once headers have arrived", async () => {
    vi.useFakeTimers();
    const f = slowFetch(10);
    vi.stubGlobal("fetch", f);
    const p = fetchHeadersWithin("https://vendor.test/fast", 1_000);
    await vi.advanceTimersByTimeAsync(10);
    const res = await p;
    // Well past the deadline, the signal handed to fetch is still live.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(await res.text()).toBe("ok");
  });

  it("still honours the caller's own signal", async () => {
    vi.stubGlobal("fetch", slowFetch(60_000));
    const caller = new AbortController();
    const p = fetchHeadersWithin("https://vendor.test/slow", 60_000, { signal: caller.signal });
    caller.abort(new Error("client went away"));
    await expect(p).rejects.toThrow("client went away");
  });
});
