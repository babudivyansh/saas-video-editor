// Coverage for the ElevenLabs diarization plumbing: transcribeAudio now
// requests speaker labels from Scribe and maps them onto WordTiming.speaker.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { ELEVENLABS_API_KEY: "sk_test_key" } }));

const { transcribeAudio } = await import("./elevenlabs");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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
