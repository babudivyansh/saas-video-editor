import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/user-facing-error";
import { GEMINI_IMAGE_BUSY, GEMINI_IMAGE_UNAVAILABLE, parseQuotaError, postGeminiImage } from "./gemini-image";

// Shape of a real Gemini 429 body (google.rpc QuotaFailure + RetryInfo).
const quotaBody = (quotaId: string, retryDelay = "3s") => JSON.stringify({
  error: {
    code: 429,
    message: "You exceeded your current quota, please check your plan and billing details.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "m", quotaId }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
    ],
  },
});

describe("parseQuotaError", () => {
  it("flags a free-tier or daily quota as a hard cap", () => {
    expect(parseQuotaError(quotaBody("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")).hardCap).toBe(true);
    expect(parseQuotaError(quotaBody("GenerateRequestsPerDayPerProjectPerModel")).hardCap).toBe(true);
  });

  it("treats a paid per-minute limit as soft and reads retryDelay", () => {
    const q = parseQuotaError(quotaBody("GenerateRequestsPerMinutePerProjectPerModel", "4.5s"));
    expect(q.hardCap).toBe(false);
    expect(q.retryDelayMs).toBe(4500);
  });

  it("survives a non-JSON body", () => {
    expect(parseQuotaError("oops")).toEqual({ quotaIds: [], retryDelayMs: null, hardCap: false });
  });
});

describe("postGeminiImage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.mocked(logger.error).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refuses at once on a free-tier quota, reporting one error (CLIPIRO-WEB-W/-X)", async () => {
    fetchMock.mockResolvedValue(new Response(quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), { status: 429 }));
    await expect(postGeminiImage({}, { tag: "t" })).rejects.toThrow(GEMINI_IMAGE_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(logger.error).mock.calls[0][1])).toMatch(/quota exhausted/);
  });

  it("waits out a per-minute limit and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(quotaBody("GenerateRequestsPerMinutePerProjectPerModel", "1s"), { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const p = postGeminiImage({}, { tag: "t" });
    await vi.advanceTimersByTimeAsync(1000);
    const res = await p;
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("gives a busy message after repeated 503s without paging", async () => {
    fetchMock.mockImplementation(async () => new Response("high demand", { status: 503 }));
    const p = postGeminiImage({}, { tag: "t" });
    const assertion = expect(p).rejects.toBeInstanceOf(UserFacingError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    await expect(p).rejects.toThrow(GEMINI_IMAGE_BUSY);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports other failures as errors", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(postGeminiImage({}, { tag: "t" })).rejects.toThrow(/failed 400/);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
