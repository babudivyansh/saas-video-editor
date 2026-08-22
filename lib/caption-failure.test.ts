import { describe, expect, it } from "vitest";
import { classifyCaptionFailure } from "./caption-failure";

describe("classifyCaptionFailure", () => {
  it("classifies a raw ElevenLabs auth error body without echoing it", () => {
    const err = new Error(
      'ElevenLabs STT error 400: {"detail":{"type":"authentication_error","code":"invalid_api_key_id_used_as_api_key","message":"API key ID used as API key"}}',
    );
    const result = classifyCaptionFailure(err);
    expect(result.category).toBe("provider_auth");
    expect(result.userMessage).not.toContain("invalid_api_key_id_used_as_api_key");
    expect(result.userMessage).not.toContain("authentication_error");
    expect(result.userMessage).not.toMatch(/\{.*"detail"/); // no raw JSON body
  });

  it("classifies no-speech-detected as its own category", () => {
    const result = classifyCaptionFailure(new Error("No speech detected (or transcription unavailable)"));
    expect(result.category).toBe("no_speech");
  });

  it("classifies a download failure", () => {
    expect(classifyCaptionFailure(new Error("download failed: ECONNRESET")).category).toBe("download_failed");
  });

  it("falls back to a generic message for an unrecognized provider error, still without echoing it", () => {
    const err = new Error("Whisper STT error 500: {\"error\":{\"message\":\"internal server error\"}}");
    const result = classifyCaptionFailure(err);
    expect(result.category).toBe("provider_unavailable");
    expect(result.userMessage).not.toContain("internal server error");
  });

  it("never throws on a non-Error value", () => {
    expect(() => classifyCaptionFailure("plain string")).not.toThrow();
    expect(() => classifyCaptionFailure(undefined)).not.toThrow();
  });

  it("every userMessage is short and free of embedded JSON/URLs", () => {
    const samples = [
      new Error("No speech detected"),
      new Error("authentication_error: bad key"),
      new Error("download failed"),
      new Error("totally unrecognized failure"),
    ];
    for (const err of samples) {
      const { userMessage } = classifyCaptionFailure(err);
      expect(userMessage.length).toBeLessThan(200);
      expect(userMessage).not.toMatch(/[{}[\]]/);
      expect(userMessage).not.toMatch(/https?:\/\//);
    }
  });
});
