import { describe, it, expect, vi, beforeEach } from "vitest";

// transcription.ts -> utils/elevenlabs -> lib/env parses the full process env at
// import time; stub it so these tests don't need a populated env. The provider
// keys are mutated per-test to drive which providers are "available". These live
// in vi.hoisted so the hoisted vi.mock factories below can reference them.
const { mockEnv, elevenLabs, falSubscribe } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
  elevenLabs: vi.fn(),
  falSubscribe: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/utils/elevenlabs", () => ({ transcribeAudio: (...a: unknown[]) => elevenLabs(...a) }));
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn(), subscribe: (...a: unknown[]) => falSubscribe(...a) } }));

import { mapFalWhisperChunks, transcribe } from "@/lib/transcription";

beforeEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  elevenLabs.mockReset();
  falSubscribe.mockReset();
});

describe("mapFalWhisperChunks", () => {
  it("maps word chunks to ms-based WordTiming", () => {
    const raw = {
      text: "hello world",
      chunks: [
        { timestamp: [0, 0.5], text: "hello" },
        { timestamp: [0.5, 1.25], text: " world" },
      ],
    };
    expect(mapFalWhisperChunks(raw)).toEqual([
      { word: "hello", start: 0, end: 500 },
      { word: "world", start: 500, end: 1250 },
    ]);
  });

  it("drops chunks with a null/absent end timestamp (whisper's trailing-chunk quirk)", () => {
    const raw = {
      chunks: [
        { timestamp: [1, 2], text: "kept" },
        { timestamp: [2, null], text: "dropped" },
        { timestamp: null, text: "also dropped" },
        { text: "no timestamp" },
      ],
    };
    expect(mapFalWhisperChunks(raw)).toEqual([{ word: "kept", start: 1000, end: 2000 }]);
  });

  it("skips empty/whitespace words", () => {
    const raw = { chunks: [{ timestamp: [0, 1], text: "   " }, { timestamp: [1, 2], text: "hi" }] };
    expect(mapFalWhisperChunks(raw)).toEqual([{ word: "hi", start: 1000, end: 2000 }]);
  });

  it("returns [] for a malformed or empty payload", () => {
    expect(mapFalWhisperChunks(null)).toEqual([]);
    expect(mapFalWhisperChunks({})).toEqual([]);
    expect(mapFalWhisperChunks({ chunks: "nope" })).toEqual([]);
    expect(mapFalWhisperChunks({ chunks: [] })).toEqual([]);
  });
});

describe("transcribe provider chain", () => {
  const buf = Buffer.from("audio");

  it("returns [] when no provider is configured", async () => {
    expect(await transcribe(buf)).toEqual([]);
    expect(elevenLabs).not.toHaveBeenCalled();
    expect(falSubscribe).not.toHaveBeenCalled();
  });

  it("falls back to fal Whisper when ElevenLabs throws", async () => {
    mockEnv.ELEVENLABS_API_KEY = "bad-key";
    mockEnv.FAL_KEY = "fal-key";
    elevenLabs.mockRejectedValue(new Error("ElevenLabs STT error 401"));
    falSubscribe.mockResolvedValue({ data: { chunks: [{ timestamp: [0, 1], text: "hi" }] } });

    expect(await transcribe(buf)).toEqual([{ word: "hi", start: 0, end: 1000 }]);
    expect(elevenLabs).toHaveBeenCalledOnce();
    expect(falSubscribe).toHaveBeenCalledOnce();
  });

  it("does not call an unconfigured provider (fal skipped without FAL_KEY)", async () => {
    mockEnv.ELEVENLABS_API_KEY = "bad-key";
    elevenLabs.mockRejectedValue(new Error("boom"));
    await expect(transcribe(buf)).rejects.toThrow("boom");
    expect(falSubscribe).not.toHaveBeenCalled();
  });

  it("prefers ElevenLabs when it returns words (fal never called)", async () => {
    mockEnv.ELEVENLABS_API_KEY = "good";
    mockEnv.FAL_KEY = "fal-key";
    elevenLabs.mockResolvedValue([{ word: "primary", start: 0, end: 100 }]);
    expect(await transcribe(buf)).toEqual([{ word: "primary", start: 0, end: 100 }]);
    expect(falSubscribe).not.toHaveBeenCalled();
  });

  it("surfaces the primary provider's error when every provider fails", async () => {
    mockEnv.ELEVENLABS_API_KEY = "bad";
    mockEnv.FAL_KEY = "fal-key";
    elevenLabs.mockRejectedValue(new Error("primary boom"));
    falSubscribe.mockRejectedValue(new Error("fal boom"));
    await expect(transcribe(buf)).rejects.toThrow("primary boom");
  });
});
