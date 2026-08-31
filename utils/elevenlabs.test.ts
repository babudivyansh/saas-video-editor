// Regression coverage for the retry-on-HTTP-error gap: every ElevenLabs call
// site used to check `!res.ok` AFTER withRetry had already returned, so a
// 429/5xx response — a RESOLVED fetch, not a rejected one — was never
// retried. fetchElevenLabs moves that check inside the retried function.
//
// Also covers the ElevenLabs diarization plumbing: transcribeAudio requests
// speaker labels from Scribe and maps them onto WordTiming.speaker.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { ELEVENLABS_API_KEY: "sk_test_key", ELEVENLABS_MAX_VOICE_SLOTS: "100" },
}));

const { fetchElevenLabs, ElevenLabsHttpError, deleteClonedVoice, transcribeAudio } = await import("./elevenlabs");

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("transcribeAudio — diarization", () => {
  it("requests diarize=true on every call", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { words: [] }));
    await transcribeAudio(Buffer.from("audio"));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("diarize")).toBe("true");
  });

  it("maps speaker_id onto WordTiming.speaker", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      words: [
        { text: "hi", start: 0, end: 0.5, type: "word", speaker_id: "speaker_0" },
        { text: "there", start: 0.6, end: 1, type: "word", speaker_id: "speaker_1" },
      ],
    }));
    const words = await transcribeAudio(Buffer.from("audio"));
    expect(words).toEqual([
      { word: "hi", start: 0, end: 500, speaker: "speaker_0" },
      { word: "there", start: 600, end: 1000, speaker: "speaker_1" },
    ]);
  });

  it("omits speaker entirely when the provider doesn't return one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      words: [{ text: "hi", start: 0, end: 0.5, type: "word" }],
    }));
    const words = await transcribeAudio(Buffer.from("audio"));
    expect(words).toEqual([{ word: "hi", start: 0, end: 500 }]);
    expect("speaker" in words[0]).toBe(false);
  });
});

describe("fetchElevenLabs", () => {
  it("retries a 429 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ctx" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ctx" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 401 — fails on the first attempt", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: { status: "authentication_error" } }));

    await expect(
      fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ctx" }),
    ).rejects.toThrow(ElevenLabsHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws ElevenLabsHttpError with the status and body once retries are exhausted", async () => {
    // mockImplementation (not mockResolvedValue) — each call must get its own
    // fresh Response instance, since fetchElevenLabs reads the body on every
    // failed attempt and a real fetch() never returns the same Response twice.
    fetchMock.mockImplementation(async () => jsonResponse(429, { error: "still limited" }));

    await expect(
      fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ElevenLabs error" }),
    ).rejects.toMatchObject({ status: 429, name: "ElevenLabsHttpError" });
    expect(fetchMock).toHaveBeenCalledTimes(3); // default maxAttempts
  });

  it("honors a Retry-After header instead of the default backoff", async () => {
    const delays: number[] = [];
    const realSetTimeout = global.setTimeout;
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (typeof ms === "number") delays.push(ms);
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }, { "Retry-After": "7" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ctx" });
    expect(delays).toContain(7000);

    vi.restoreAllMocks();
  });

  it("treats a status in okStatuses as success without retrying", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const res = await fetchElevenLabs("https://api.elevenlabs.io/v1/x", {}, { timeoutMs: 1000, errorContext: "ctx", okStatuses: [404] });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("deleteClonedVoice — 404 tolerance end to end", () => {
  it("does not throw when the voice is already gone (404)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteClonedVoice("voice-1")).resolves.toBeUndefined();
  });

  it("still throws on a real failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    await expect(deleteClonedVoice("voice-1")).rejects.toThrow(ElevenLabsHttpError);
  });
});
