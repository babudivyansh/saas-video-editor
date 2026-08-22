import { describe, expect, it } from "vitest";
import { classifyRenderFailure } from "./render-failure";

describe("classifyRenderFailure", () => {
  it("classifies a missing bundled font as missing_resource, never echoing the raw path", () => {
    const err = new Error('No usable font file found for "Anton" (tried: /some/internal/path.ttf; cwd: /app)');
    const result = classifyRenderFailure(err);
    expect(result.category).toBe("missing_resource");
    expect(result.userMessage).not.toContain("/some/internal/path.ttf");
    expect(result.userMessage).not.toContain("/app");
  });

  it("classifies an ffmpeg timeout", () => {
    const err = new Error("FFmpeg timed out after 900000ms and was killed");
    expect(classifyRenderFailure(err).category).toBe("timeout");
  });

  it("classifies a non-zero ffmpeg exit, without leaking stderr content", () => {
    const err = new Error(
      "FFmpeg exited 1:\nSome internal stderr mentioning /var/secret/path and an AWS key AKIA1234567890",
    );
    const result = classifyRenderFailure(err);
    expect(result.category).toBe("encoding_failed");
    expect(result.userMessage).not.toContain("/var/secret/path");
    expect(result.userMessage).not.toContain("AKIA1234567890");
  });

  it("classifies an asset download failure", () => {
    const err = new Error("download failed: getaddrinfo ENOTFOUND bucket.s3.amazonaws.com");
    expect(classifyRenderFailure(err).category).toBe("download_failed");
  });

  it("classifies an invalid/missing editor document", () => {
    expect(classifyRenderFailure(new Error("Project has no editor document")).category).toBe("invalid_document");
  });

  it("falls back to unknown for an unrecognized error shape, still without echoing raw text", () => {
    const err = new Error("some never-seen-before internal failure with a secret token sk_abcdef123456");
    const result = classifyRenderFailure(err);
    expect(result.category).toBe("unknown");
    expect(result.userMessage).not.toContain("sk_abcdef123456");
  });

  it("never throws on a non-Error value", () => {
    expect(() => classifyRenderFailure("plain string")).not.toThrow();
    expect(() => classifyRenderFailure(undefined)).not.toThrow();
    expect(() => classifyRenderFailure({ weird: "object" })).not.toThrow();
  });

  it("every userMessage is a short, generic sentence with no path separators or URLs", () => {
    const samples = [
      new Error('No usable font file found for "Anton"'),
      new Error("FFmpeg timed out after 5ms"),
      new Error("FFmpeg exited 137"),
      new Error("download failed"),
      new Error("Invalid timeline: bad doc"),
      new Error("totally unknown"),
    ];
    for (const err of samples) {
      const { userMessage } = classifyRenderFailure(err);
      expect(userMessage.length).toBeLessThan(200);
      expect(userMessage).not.toMatch(/https?:\/\//);
      expect(userMessage).not.toMatch(/[/\\][a-zA-Z0-9_-]+[/\\]/); // no embedded filesystem paths
    }
  });
});
