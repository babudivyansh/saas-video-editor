import { beforeEach, describe, expect, it, vi } from "vitest";

// CLIPIRO-WEB-9: one upsert per web-vitals beacon exhausted the 15-connection
// DB pooler under a burst. Beacons now add up in memory and are written once
// per key per flush, one at a time.

let inFlight = 0;
let maxInFlight = 0;
const upsert = vi.fn(async (..._a: unknown[]) => {
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, 1));
  inFlight--;
});
vi.mock("@/lib/prisma", () => ({ prisma: { webVitalDaily: { upsert: (...a: unknown[]) => upsert(...a) } } }));
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));

const { recordVital, flushVitals, pendingVitals } = await import("./web-vitals-buffer");

const key = (metric: string) => ({ date: "2026-11-19", metric, path: "/", bucket: "good" });

beforeEach(async () => {
  await flushVitals();
  upsert.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();
  maxInFlight = 0;
});

describe("web-vitals buffer", () => {
  it("adds up a burst of beacons into one write per key, never in parallel", async () => {
    for (let i = 0; i < 50; i++) recordVital(key("LCP"));
    for (let i = 0; i < 20; i++) recordVital(key("CLS"));
    expect(upsert).not.toHaveBeenCalled();
    expect(pendingVitals()).toHaveLength(2);

    await flushVitals();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { date_metric_path_bucket: key("LCP") },
      create: { ...key("LCP"), count: 50 },
      update: { count: { increment: 50 } },
    });
    expect(pendingVitals()).toEqual([]);
  });

  it("logs a failed write as one warning, never an error", async () => {
    upsert.mockRejectedValueOnce(new Error("EMAXCONNSESSION")).mockRejectedValueOnce(new Error("EMAXCONNSESSION"));
    recordVital(key("LCP"));
    recordVital(key("INP"));
    await flushVitals();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("flushes on its own after the interval", async () => {
    vi.useFakeTimers();
    try {
      recordVital(key("TTFB"));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(upsert).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
