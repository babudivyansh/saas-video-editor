import { beforeEach, describe, expect, it, vi } from "vitest";

// translateTranscript keeps the source words for a batch the model fails on,
// so one bad batch doesn't leave a silent gap. But when EVERY batch fails the
// result is just the source transcript, and the caption-translate route used
// to re-render the clip with it and report success.

const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class { getGenerativeModel() { return { generateContent }; } },
}));
vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/with-retry", () => ({ withRetry: (fn: (s: AbortSignal) => Promise<unknown>) => fn(new AbortController().signal) }));

const words = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ word: `w${from + i}`, start: (from + i) * 100, end: (from + i) * 100 + 90 }));
const reply = (arr: unknown) => ({ response: { text: () => JSON.stringify(arr) } });

beforeEach(() => { generateContent.mockReset(); });

describe("translateTranscript", () => {
  it("throws when not one batch was translated, instead of returning the source as a translation", async () => {
    const { translateTranscript } = await import("./caption-translate");
    generateContent.mockImplementation(async () => { throw new Error("[404 Not Found] model no longer available"); });
    await expect(translateTranscript(words(3), "es")).rejects.toThrow(/^Translation failed for every part of the transcript/);
  });

  it("keeps the source words for a failed batch when another batch worked", async () => {
    const { translateTranscript } = await import("./caption-translate");
    generateContent
      .mockResolvedValueOnce(reply([{ word: "hola", start: 0, end: 50 }]))
      .mockImplementationOnce(async () => { throw new Error("timeout"); });
    const out = await translateTranscript(words(130), "es");
    expect(out[0].word).toBe("hola");
    // Batch two (words 120-129) kept as spoken.
    expect(out.slice(-10).map((w) => w.word)).toEqual(words(10, 120).map((w) => w.word));
  });
});
