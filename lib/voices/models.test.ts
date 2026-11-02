import { describe, expect, it } from "vitest";
import { VOICEOVER_MAX_CHARS as SHARED_MAX } from "@clipiro/shared";
import { AUTO_LANGUAGE, TTS_LANGUAGES, TTS_MODEL, VOICEOVER_MAX_CHARS, estimateSpokenSeconds, normalizeTtsLanguage } from "./models";

describe("voiceover models", () => {
  it("reads standard with v4 Turbo and studio with v4", () => {
    expect(TTS_MODEL).toEqual({ standard: "eleven_v4_turbo", studio: "eleven_v4" });
  });

  it("offers the 94 languages /v1/models lists for eleven_v4, once each", () => {
    expect(TTS_LANGUAGES).toHaveLength(94);
    expect(new Set(TTS_LANGUAGES.map((l) => l.code)).size).toBe(94);
    for (const code of ["en", "hi", "ta", "bn", "zh", "yue", "ar", "sw", "zu"]) {
      expect(TTS_LANGUAGES.some((l) => l.code === code), code).toBe(true);
    }
  });

  it("keeps the phone's cap in step with the web's", () => {
    expect(SHARED_MAX).toBe(VOICEOVER_MAX_CHARS);
  });
});

describe("normalizeTtsLanguage", () => {
  it("treats a missing language as auto-detect", () => {
    expect(normalizeTtsLanguage(undefined)).toBe(AUTO_LANGUAGE);
    expect(normalizeTtsLanguage("")).toBe(AUTO_LANGUAGE);
    expect(normalizeTtsLanguage("auto")).toBe(AUTO_LANGUAGE);
  });
  it("passes a supported code and refuses anything else", () => {
    expect(normalizeTtsLanguage("hi")).toBe("hi");
    expect(normalizeTtsLanguage("xx")).toBeNull();
    expect(normalizeTtsLanguage("en-US")).toBeNull();
    expect(normalizeTtsLanguage(42)).toBeNull();
  });
});

describe("estimateSpokenSeconds", () => {
  it("goes by words for spaced scripts", () => {
    expect(estimateSpokenSeconds("")).toBe(0);
    expect(estimateSpokenSeconds(Array(150).fill("word").join(" "))).toBe(60);
  });
  it("goes by characters for Chinese and Japanese, which it used to call 0:00", () => {
    expect(estimateSpokenSeconds("今天天气很好我们去公园散步吧")).toBeGreaterThan(0);
    expect(estimateSpokenSeconds("こんにちは、元気ですか", "ja")).toBeGreaterThan(0);
  });
});
