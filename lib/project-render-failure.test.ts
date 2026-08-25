import { describe, expect, it } from "vitest";
import { classifyProjectRenderFailure } from "./project-render-failure";

// utils/download.ts builds its error as `Download failed: HTTP {code} for {url}`
// — the FULL presigned URL, signature included. The whole point of this module
// is that none of that reaches Project.failureReason.
const SIGNED =
  "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/uploads/user-1/a.mp4" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=21600&X-Amz-Signature=deadbeef";

describe("classifyProjectRenderFailure", () => {
  it("classifies an expired presigned source URL", () => {
    const c = classifyProjectRenderFailure(new Error(`Download failed: HTTP 403 for ${SIGNED}`));
    expect(c.category).toBe("source_expired");
  });

  it("classifies S3's own expiry wording", () => {
    expect(classifyProjectRenderFailure(new Error("AccessDenied: Request has expired")).category)
      .toBe("source_expired");
  });

  it("classifies a deleted source object as missing, not as a generic download failure", () => {
    const c = classifyProjectRenderFailure(new Error(`Download failed: HTTP 404 for ${SIGNED}`));
    expect(c.category).toBe("source_missing");
  });

  it("classifies a project with no source at all", () => {
    expect(classifyProjectRenderFailure(new Error("Project abc missing uploadedVideoUrl")).category)
      .toBe("source_missing");
  });

  it("classifies transport failures", () => {
    expect(classifyProjectRenderFailure(new Error("getaddrinfo ENOTFOUND s3.amazonaws.com")).category)
      .toBe("source_download_failed");
    expect(classifyProjectRenderFailure(new Error("Download timed out after 300000ms")).category)
      .toBe("source_download_failed");
  });

  it("classifies render and storage failures", () => {
    expect(classifyProjectRenderFailure(new Error("FFmpeg exited with code 1")).category).toBe("render_failed");
    expect(classifyProjectRenderFailure(new Error("No usable font file found")).category).toBe("render_failed");
    expect(classifyProjectRenderFailure(new Error("PutObject failed")).category).toBe("storage_failed");
  });

  it("falls back safely for anything unrecognized, and never throws on odd input", () => {
    expect(classifyProjectRenderFailure(new Error("kaboom")).category).toBe("unknown_failure");
    expect(classifyProjectRenderFailure(null).category).toBe("unknown_failure");
    expect(classifyProjectRenderFailure(undefined).category).toBe("unknown_failure");
    expect(classifyProjectRenderFailure({ weird: true }).category).toBe("unknown_failure");
  });

  it("never echoes the raw error — no URL, signature, bucket or path leaks into the user message", () => {
    const dumps = [
      new Error(`Download failed: HTTP 403 for ${SIGNED}`),
      new Error(`Download failed: HTTP 404 for ${SIGNED}`),
      new Error(`FFmpeg exited with code 1: /tmp/project-1-user.mp4 not readable`),
      new Error(`S3 PutObject failed for bucket saas-video-editor-assets`),
      new Error(SIGNED),
    ];
    for (const err of dumps) {
      const { userMessage } = classifyProjectRenderFailure(err);
      expect(userMessage).not.toMatch(/X-Amz|Signature|amazonaws|saas-video-editor-assets|\/tmp\/|https?:/i);
    }
  });
});
