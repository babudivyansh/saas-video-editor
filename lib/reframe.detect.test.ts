import { beforeEach, describe, expect, it, vi } from "vitest";

// "no faces in this video" and "face detection could not run" were both an
// empty array, so the UI blamed the user's footage for a server-side fault.
// Observed in practice: an IAM policy missing rekognition:StartFaceDetection
// disabled speaker tracking for every video on the deployment while telling
// each user their particular file was the problem.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

const send = vi.fn();
vi.mock("@aws-sdk/client-rekognition", () => ({
  RekognitionClient: class { send = send; },
  StartFaceDetectionCommand: class { constructor(public input: unknown) {} },
  GetFaceDetectionCommand: class { constructor(public input: unknown) {} },
}));

const { detectFaceTimeline } = await import("./reframe");

const S3_URL = "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/user/source.mp4";

beforeEach(() => send.mockReset());

describe("detectFaceTimeline failure classification", () => {
  it("reports an empty result with NO failure when detection ran and found no faces", async () => {
    send
      .mockResolvedValueOnce({ JobId: "job-1" })
      .mockResolvedValueOnce({ JobStatus: "SUCCEEDED", Faces: [] });
    const res = await detectFaceTimeline(S3_URL);
    expect(res.boxes).toEqual([]);
    expect(res.failure).toBeUndefined();
  });

  it("classifies an IAM AccessDenied as a deployment misconfiguration", async () => {
    const err = Object.assign(new Error("not authorized to perform: rekognition:StartFaceDetection"), {
      name: "AccessDeniedException",
    });
    send.mockRejectedValueOnce(err);
    expect((await detectFaceTimeline(S3_URL)).failure).toBe("unconfigured");
  });

  it("classifies bad credentials the same way", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("bad key"), { name: "UnrecognizedClientException" }));
    expect((await detectFaceTimeline(S3_URL)).failure).toBe("unconfigured");
  });

  it("classifies a transient AWS error as a plain failure", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("throttled"), { name: "ThrottlingException" }));
    expect((await detectFaceTimeline(S3_URL)).failure).toBe("error");
  });

  it("classifies a FAILED Rekognition job as a failure", async () => {
    send
      .mockResolvedValueOnce({ JobId: "job-1" })
      .mockResolvedValueOnce({ JobStatus: "FAILED", StatusMessage: "unsupported codec" });
    expect((await detectFaceTimeline(S3_URL)).failure).toBe("error");
  });

  it("returns detected faces with no failure", async () => {
    send
      .mockResolvedValueOnce({ JobId: "job-1" })
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        Faces: [{ Timestamp: 1000, Face: { BoundingBox: { Left: 0.2, Top: 0.1, Width: 0.3, Height: 0.4 }, Confidence: 99 } }],
      });
    const res = await detectFaceTimeline(S3_URL);
    expect(res.failure).toBeUndefined();
    expect(res.boxes).toHaveLength(1);
    expect(res.boxes[0]).toMatchObject({ tSec: 1, x: 0.2, y: 0.1, w: 0.3, h: 0.4 });
  });

  it("treats an unparseable source URL as unconfigured rather than a faceless video", async () => {
    expect((await detectFaceTimeline("not-a-bucket-url")).failure).toBe("unconfigured");
    expect(send).not.toHaveBeenCalled();
  });
});
