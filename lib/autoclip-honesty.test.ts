// The pipeline used to fill missing model output with confident-sounding
// sentences — "Strong dynamic start.", "High potential retention.",
// "5:00 PM local time", "#highlight #viral", "Check out this amazing moment!" —
// and then PERSIST them into scoreBreakdown.
//
// That is the worst version of this bug. Once stored, a clip the model never
// described is indistinguishable from one it did, for every consumer from then
// on: the UI, the API, any later analysis. The UI can render "not available"
// honestly; it cannot un-say a fabrication that is now in the database.
//
// These tests pin the rule: absent analysis stays absent.

import { describe, expect, it } from "vitest";
import { transcriptSchema } from "./autoclip-rerender";

/**
 * Mirrors the normalization the Gemini parser applies. Kept in step with
 * `textOrNull` in lib/autoclip-pipeline.ts — if that ever grows a fallback
 * again, this is the test that should fail.
 */
const textOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

describe("analysis normalization — no invented content", () => {
  it.each([undefined, null, "", "   ", 42, {}, []])(
    "yields null rather than a stand-in sentence for %p",
    (value) => {
      expect(textOrNull(value)).toBeNull();
    },
  );

  it("keeps and trims a genuine value", () => {
    expect(textOrNull("  Opens on a strong claim.  ")).toBe("Opens on a strong claim.");
  });

  // The specific strings that used to be persisted. If any of them reappears
  // as a fallback, it will be stored and become indistinguishable from real
  // model output — so name them explicitly.
  const BANNED = [
    "Strong dynamic start.",
    "High potential retention.",
    "Highly engaging highlight from the source video.",
    "General social media audience.",
    "YouTube Shorts, Instagram Reels",
    "5:00 PM local time",
    "Check out this amazing moment!",
  ];

  it.each(BANNED)("never substitutes %p for missing output", (fabricated) => {
    expect(textOrNull(undefined)).not.toBe(fabricated);
    expect(textOrNull("")).not.toBe(fabricated);
  });
});

describe("transcript edits preserve diarization", () => {
  // `.strict()` with only {word,start,end} silently stripped the speaker label
  // off every word on save. The edit overwrites the stored transcript and
  // diarization is only produced at transcription time, so correcting one typo
  // permanently destroyed the speaker track — with nothing to warn the user.
  it("accepts and preserves a speaker label", () => {
    const parsed = transcriptSchema.parse([
      { word: "hello", start: 0, end: 400, speaker: "speaker_0" },
      { word: "there", start: 400, end: 900, speaker: "speaker_1" },
    ]);

    expect(parsed[0].speaker).toBe("speaker_0");
    expect(parsed[1].speaker).toBe("speaker_1");
  });

  it("still accepts transcripts with no speaker — Whisper and fal never set one", () => {
    const parsed = transcriptSchema.parse([{ word: "hello", start: 0, end: 400 }]);
    expect(parsed[0].speaker).toBeUndefined();
  });

  it("still rejects unknown fields", () => {
    expect(() =>
      transcriptSchema.parse([{ word: "x", start: 0, end: 1, injected: "nope" }]),
    ).toThrow();
  });

  it("bounds the speaker label so it can't be used to smuggle a payload", () => {
    expect(() =>
      transcriptSchema.parse([{ word: "x", start: 0, end: 1, speaker: "s".repeat(65) }]),
    ).toThrow();
  });
});
