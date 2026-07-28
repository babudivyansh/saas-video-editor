import { beforeEach, describe, expect, it, vi } from "vitest";

const rekognitionSend = vi.fn();
vi.mock("@/lib/reframe", () => ({ rekognition: { send: (...args: unknown[]) => rekognitionSend(...args) } }));
vi.mock("@aws-sdk/client-rekognition", () => ({
  DetectModerationLabelsCommand: class { constructor(public input: unknown) {} },
}));

let attachmentUpdate: ReturnType<typeof vi.fn>;
let review: { status: string } | null;
let reviewUpdate: ReturnType<typeof vi.fn>;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewAttachment: { update: (...args: unknown[]) => attachmentUpdate(...args) },
    review: {
      findUnique: vi.fn(async () => review),
      update: (...args: unknown[]) => reviewUpdate(...args),
    },
  },
}));

const generateVideoThumbnail = vi.fn();
vi.mock("@/lib/asset-thumbnail", () => ({ generateVideoThumbnail: (...args: unknown[]) => generateVideoThumbnail(...args) }));

const notifyAdmins = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notifyAdmins: (...args: unknown[]) => notifyAdmins(...args) }));

vi.mock("@/utils/s3-upload", () => ({ extensionForMime: () => "mp4" }));

const { reviewAttachmentModerationJob } = await import("./attachment-moderation");

const basePayload = {
  projectId: "att-1",
  attachmentId: "att-1",
  reviewId: "rev-1",
  userId: "u1",
  s3Key: "review-attachments/u1/a.jpg",
  mimeType: "image/jpeg",
  kind: "image" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  attachmentUpdate = vi.fn(async () => ({}));
  reviewUpdate = vi.fn(async () => ({}));
  review = { status: "pending" };
});

describe("reviewAttachmentModerationJob", () => {
  it("marks a clean image clean", async () => {
    rekognitionSend.mockResolvedValue({ ModerationLabels: [] });
    await reviewAttachmentModerationJob(basePayload);
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att-1" }, data: expect.objectContaining({ moderationStatus: "clean" }) }),
    );
    expect(reviewUpdate).not.toHaveBeenCalled();
  });

  it("flags a high-confidence label and auto-hides the parent review", async () => {
    rekognitionSend.mockResolvedValue({ ModerationLabels: [{ Name: "Explicit Nudity", Confidence: 95 }] });
    await reviewAttachmentModerationJob(basePayload);
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "flagged" }) }),
    );
    expect(reviewUpdate).toHaveBeenCalledWith({ where: { id: "rev-1" }, data: { status: "hidden" } });
    expect(notifyAdmins).toHaveBeenCalledWith(
      "admin_review_spam_detected",
      expect.any(String),
      expect.stringContaining("Explicit Nudity"),
      "/admin/reviews/rev-1",
    );
  });

  it("does not flag a low-confidence label", async () => {
    rekognitionSend.mockResolvedValue({ ModerationLabels: [{ Name: "Suggestive", Confidence: 40 }] });
    await reviewAttachmentModerationJob(basePayload);
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "clean" }) }),
    );
  });

  it("does not re-hide an already-hidden review", async () => {
    review = { status: "hidden" };
    rekognitionSend.mockResolvedValue({ ModerationLabels: [{ Name: "Explicit Nudity", Confidence: 95 }] });
    await reviewAttachmentModerationJob(basePayload);
    expect(reviewUpdate).not.toHaveBeenCalled();
  });

  it("extracts a video frame before scanning, and skips when extraction fails", async () => {
    generateVideoThumbnail.mockResolvedValue(null);
    await reviewAttachmentModerationJob({ ...basePayload, kind: "video", mimeType: "video/mp4" });
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moderationStatus: "skipped" } }),
    );
    expect(rekognitionSend).not.toHaveBeenCalled();
  });

  it("scans the extracted thumbnail for a video and stores the thumbnail key", async () => {
    generateVideoThumbnail.mockResolvedValue("thumbnails/u1/att-1.jpg");
    rekognitionSend.mockResolvedValue({ ModerationLabels: [] });
    await reviewAttachmentModerationJob({ ...basePayload, kind: "video", mimeType: "video/mp4" });
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "clean", thumbnailS3Key: "thumbnails/u1/att-1.jpg" }) }),
    );
  });

  it("falls back to skipped on a scan failure, never reporting clean", async () => {
    rekognitionSend.mockRejectedValue(new Error("AWS down"));
    await reviewAttachmentModerationJob(basePayload);
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moderationStatus: "skipped" } }),
    );
  });
});
