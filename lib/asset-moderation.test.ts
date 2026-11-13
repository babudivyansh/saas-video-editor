import { beforeEach, describe, expect, it, vi } from "vitest";

// The failure path is the one that matters here: production ran for months
// with every scan refused (missing IAM permission), and this path quietly
// marked each upload "skipped" and threw its new thumbnail away.

const rekognitionSend = vi.fn();
vi.mock("@/lib/reframe", () => ({ rekognition: { send: (...args: unknown[]) => rekognitionSend(...args) } }));
vi.mock("@aws-sdk/client-rekognition", () => ({
  DetectModerationLabelsCommand: class { constructor(public input: unknown) {} },
}));

const assetUpdate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { update: (...a: unknown[]) => assetUpdate(...a) } } }));
vi.mock("@/lib/env", () => ({ env: { AWS_S3_BUCKET: "bucket" } }));

const generateVideoThumbnail = vi.fn();
const generateImageThumbnail = vi.fn();
vi.mock("@/lib/asset-thumbnail", () => ({
  generateVideoThumbnail: (...a: unknown[]) => generateVideoThumbnail(...a),
  generateImageThumbnail: (...a: unknown[]) => generateImageThumbnail(...a),
}));
vi.mock("@/lib/asset-audit", () => ({ auditAssetAction: vi.fn(async () => {}) }));
vi.mock("@/utils/s3-upload", () => ({ extensionForMime: () => "mp4" }));
const logError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() } }));
// Built at import time; unmocked it starts a live queue worker.
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue: vi.fn(), driver: "in-process" }) }));

const { assetModerationJob } = await import("./asset-moderation");

const video = {
  projectId: "a1", assetId: "a1", userId: "u1", s3Key: "uploads/u1/v.mp4", mimeType: "video/mp4", kind: "video" as const,
};
const denied = Object.assign(new Error("User is not authorized to perform: rekognition:DetectModerationLabels"), { name: "AccessDeniedException" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assetModerationJob", () => {
  it("scans a video's frame and marks it clean", async () => {
    generateVideoThumbnail.mockResolvedValue("thumbnails/u1/a1.jpg");
    rekognitionSend.mockResolvedValue({ ModerationLabels: [] });
    await assetModerationJob(video);
    expect(assetUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ moderationStatus: "clean", thumbnailS3Key: "thumbnails/u1/a1.jpg" }),
    }));
    expect(logError).not.toHaveBeenCalled();
  });

  it("on a refused scan: skipped with the reason, keeps the thumbnail, and reports an error", async () => {
    generateVideoThumbnail.mockResolvedValue("thumbnails/u1/a1.jpg");
    rekognitionSend.mockRejectedValue(denied);
    await assetModerationJob(video);
    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: {
        moderationStatus: "skipped",
        moderationLabels: {
          malwareScan: "not_configured",
          scanError: "AccessDeniedException: User is not authorized to perform: rekognition:DetectModerationLabels",
        },
        thumbnailS3Key: "thumbnails/u1/a1.jpg",
      },
    });
    expect(logError).toHaveBeenCalledWith("asset-moderation", expect.stringContaining("a1"), denied);
  });

  it("keeps an image's measured dimensions when its scan is refused", async () => {
    generateImageThumbnail.mockResolvedValue({ thumbnailS3Key: "thumbnails/u1/a1.jpg", width: 640, height: 480 });
    rekognitionSend.mockRejectedValue(denied);
    await assetModerationJob({ ...video, kind: "image", mimeType: "image/png", s3Key: "uploads/u1/i.png" });
    expect(assetUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ moderationStatus: "skipped", thumbnailS3Key: "thumbnails/u1/a1.jpg", width: 640, height: 480 }),
    }));
  });
});
