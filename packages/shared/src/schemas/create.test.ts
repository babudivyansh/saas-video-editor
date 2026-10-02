import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTOCLIP_SETTINGS,
  autoClipSettingsSchema,
  formatBytes,
  formatHours,
  imageGenerateRequest,
  planAtLeast,
  sourceLinkSchema,
  uploadProblem,
  voiceoverRequest,
} from "./create";

const GB = 1024 ** 3;

describe("create schemas", () => {
  it("defaults AutoClip settings like the web page", () => {
    expect(DEFAULT_AUTOCLIP_SETTINGS).toMatchObject({
      clipLength: "standard",
      clipCount: 8,
      aspectRatio: "9:16",
      captionTemplateId: "clean",
      smartAutoReframe: true,
      reframingPreset: "balanced",
      zoomStrength: "medium",
      speakerMode: "auto",
      removeSilence: false,
      silenceThresholdMs: 400,
    });
  });

  it("bounds clip count and instructions", () => {
    expect(autoClipSettingsSchema.safeParse({ clipCount: 0 }).success).toBe(false);
    expect(autoClipSettingsSchema.safeParse({ clipCount: 21 }).success).toBe(false);
    expect(autoClipSettingsSchema.safeParse({ instructions: "x".repeat(501) }).success).toBe(false);
    expect(autoClipSettingsSchema.safeParse({ aspectRatio: "4:5" }).success).toBe(false);
  });

  it("explains unsupported links", () => {
    const r = sourceLinkSchema.safeParse("https://tiktok.com/@a/video/1");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/YouTube, Vimeo, Loom/);
    expect(sourceLinkSchema.parse("  https://youtu.be/abc  ")).toBe("https://youtu.be/abc");
  });

  it("checks a picked file against the plan", () => {
    expect(uploadProblem({ sizeBytes: 300 * 1024 ** 2, mimeType: "video/mp4" }, "free")).toMatch(/Free plan's 250 MB/);
    expect(uploadProblem({ sizeBytes: 300 * 1024 ** 2, mimeType: "video/mp4" }, "creator")).toBeNull();
    expect(uploadProblem({ sizeBytes: 6 * GB, mimeType: "video/quicktime" }, "studio")).toMatch(/5 GB/);
    expect(uploadProblem({ sizeBytes: 1000, mimeType: "video/x-matroska" }, "studio")).toMatch(/MP4, MOV or WebM/);
  });

  it("ranks plans", () => {
    expect(planAtLeast("pro", "creator")).toBe(true);
    expect(planAtLeast("creator", "pro")).toBe(false);
  });

  it("formats sizes and lengths", () => {
    expect(formatBytes(5 * GB)).toBe("5 GB");
    expect(formatBytes(250 * 1024 ** 2)).toBe("250 MB");
    expect(formatHours(6 * 3600)).toBe("6 h");
    expect(formatHours(30 * 60)).toBe("30 min");
  });

  it("validates generation requests", () => {
    expect(imageGenerateRequest.safeParse({ prompt: "  ", modelId: "x", ratio: "1:1" }).success).toBe(false);
    expect(imageGenerateRequest.safeParse({ prompt: "a cat", modelId: "x", ratio: "4:5" }).success).toBe(false);
    expect(voiceoverRequest.safeParse({ text: "x".repeat(2001), voiceId: "brian" }).success).toBe(false);
  });
});
