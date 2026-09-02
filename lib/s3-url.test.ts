import { describe, expect, it } from "vitest";
import { parseS3Url } from "./s3-url";

const BUCKET = "saas-video-editor-assets";
const HOST = `https://${BUCKET}.s3.ap-south-1.amazonaws.com`;

describe("parseS3Url", () => {
  it("parses a plain object URL", () => {
    expect(parseS3Url(`${HOST}/uploads/u1/video.mp4`)).toEqual({
      bucket: BUCKET,
      key: "uploads/u1/video.mp4",
    });
  });

  // The bug this function shipped with. Project.uploadedVideoUrl stores a
  // PRESIGNED URL, and the old greedy `(.+)$` capture pulled the whole
  // signature query string into the key — so every lookup that tried to
  // resolve a project's source asset from its stored URL found nothing, and
  // the provenance backfill resolved 0 of 15 real projects.
  it("ignores the presigned query string when extracting the key", () => {
    const presigned =
      `${HOST}/uploads/73f23ab8/c9e4806d.mp4` +
      "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD" +
      "&X-Amz-Credential=AKIAEXAMPLE%2F20260812%2Fap-south-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20260812T122001Z&X-Amz-Expires=21600&X-Amz-Signature=deadbeef" +
      "&X-Amz-SignedHeaders=host&x-id=GetObject";

    expect(parseS3Url(presigned)).toEqual({
      bucket: BUCKET,
      key: "uploads/73f23ab8/c9e4806d.mp4",
    });
  });

  it("ignores a fragment too", () => {
    expect(parseS3Url(`${HOST}/renders/p1/clip-0.mp4#t=10`)?.key).toBe("renders/p1/clip-0.mp4");
  });

  it("decodes percent-encoded key segments", () => {
    expect(parseS3Url(`${HOST}/uploads/u1/my%20clip%20(1).mp4`)?.key).toBe("uploads/u1/my clip (1).mp4");
  });

  it("rejects hosts that are not our virtual-hosted S3 shape", () => {
    expect(parseS3Url("https://cdn.example.com/video.mp4")).toBeNull();
    expect(parseS3Url("https://example.com/fake-source.mp4")).toBeNull();
    // A lookalike host must not be mistaken for the real thing.
    expect(parseS3Url("https://evil.com/bucket.s3.ap-south-1.amazonaws.com/key.mp4")).toBeNull();
  });

  it("rejects non-https and unparseable input", () => {
    expect(parseS3Url(`http://${BUCKET}.s3.ap-south-1.amazonaws.com/key.mp4`)).toBeNull();
    expect(parseS3Url("not a url")).toBeNull();
    expect(parseS3Url("")).toBeNull();
  });

  it("rejects a bucket root with no key", () => {
    expect(parseS3Url(`${HOST}/`)).toBeNull();
    expect(parseS3Url(HOST)).toBeNull();
  });
});
