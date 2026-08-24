// P0-3: a failed AutoClip re-render recorded `failureReason: null`, leaving a
// production P0 with no diagnosable reason. These pin the classification and,
// crucially, that nothing sensitive from the raw error survives into the
// message persisted on the project.

import { describe, expect, it } from "vitest";
import { classifyAutoClipFailure } from "./autoclip-failure";

describe("classifyAutoClipFailure", () => {
  it("recognises the P0-3 expired-presigned-source signature", () => {
    const raw = new Error(
      "download failed 403: <Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>",
    );
    const { category, userMessage } = classifyAutoClipFailure(raw);
    expect(category).toBe("source_expired");
    expect(userMessage).toMatch(/re-upload/i);
  });

  it("distinguishes the other pipeline stages", () => {
    const cases: [string, string][] = [
      ["download failed: ECONNRESET", "source_download_failed"],
      ["probe failed: no video stream found", "probe_failed"],
      ["Scribe transcription request failed", "transcription_failed"],
      ["FFmpeg exited 1: No such filter: 'drawtext'", "render_failed"],
      ["S3 PutObject failed", "storage_failed"],
    ];
    for (const [message, expected] of cases) {
      expect(`${message} => ${classifyAutoClipFailure(new Error(message)).category}`)
        .toBe(`${message} => ${expected}`);
    }
  });

  it("falls back rather than throwing on unknown, empty or non-Error input", () => {
    for (const input of [new Error("something entirely novel"), "", null, undefined, 42, {}]) {
      expect(classifyAutoClipFailure(input).category).toBe("unknown_pipeline_failure");
    }
  });

  it("never leaks a presigned signature, temp path or provider body into the persisted message", () => {
    const raw = new Error(
      "download failed for https://bucket.s3.ap-south-1.amazonaws.com/uploads/u1/v.mp4" +
        "?X-Amz-Signature=deadbeefdeadbeef&X-Amz-Credential=AKIAEXAMPLE " +
        "to /tmp/proj-src-render.mp4",
    );
    const { userMessage } = classifyAutoClipFailure(raw);
    expect(userMessage).not.toMatch(/X-Amz|Signature|deadbeef|AKIA|amazonaws|\/tmp\/|https?:/i);
  });
});
