import { beforeEach, describe, expect, it, vi } from "vitest";

// What the re-scan picks up, and that it never queues a row twice.

const assetFindMany = vi.fn();
const assetUpdateMany = vi.fn();
const attachmentFindMany = vi.fn();
const attachmentUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findMany: (...a: unknown[]) => assetFindMany(...a), updateMany: (...a: unknown[]) => assetUpdateMany(...a) },
    reviewAttachment: { findMany: (...a: unknown[]) => attachmentFindMany(...a), updateMany: (...a: unknown[]) => attachmentUpdateMany(...a) },
  },
}));
const enqueueAssetModeration = vi.fn();
const enqueueReviewAttachmentModeration = vi.fn();
vi.mock("@/lib/asset-moderation", () => ({ enqueueAssetModeration: (...a: unknown[]) => enqueueAssetModeration(...a) }));
vi.mock("@/lib/reviews/attachment-moderation", () => ({
  enqueueReviewAttachmentModeration: (...a: unknown[]) => enqueueReviewAttachmentModeration(...a),
}));

const { rescanSkippedUploads, SELF_PRODUCED_SOURCES } = await import("./moderation-rescan");

const asset = (id: string) => ({ id, userId: "u1", s3Key: `uploads/u1/${id}.mp4`, mimeType: "video/mp4", kind: "video" });

beforeEach(() => {
  vi.clearAllMocks();
  assetFindMany.mockResolvedValue([asset("a1"), asset("a2")]);
  attachmentFindMany.mockResolvedValue([]);
  assetUpdateMany.mockResolvedValue({ count: 1 });
  attachmentUpdateMany.mockResolvedValue({ count: 1 });
});

describe("rescanSkippedUploads", () => {
  it("only looks at skipped, live, visual uploads the user provided", async () => {
    await rescanSkippedUploads();
    const where = assetFindMany.mock.calls[0][0].where;
    expect(where).toEqual({
      moderationStatus: "skipped",
      kind: { in: ["image", "video"] },
      archivedAt: null,
      sourceFeature: { notIn: SELF_PRODUCED_SOURCES },
    });
    expect(SELF_PRODUCED_SOURCES).toEqual(expect.arrayContaining(["autoclip", "stock"]));
  });

  it("is a dry run by default: counts, changes nothing, queues nothing", async () => {
    const r = await rescanSkippedUploads();
    expect(r).toEqual({ dryRun: true, assets: 2, attachments: 0, queued: 0 });
    expect(assetUpdateMany).not.toHaveBeenCalled();
    expect(enqueueAssetModeration).not.toHaveBeenCalled();
  });

  it("claims each row before queueing it, and skips one already claimed", async () => {
    assetUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await rescanSkippedUploads({ dryRun: false });
    expect(assetUpdateMany).toHaveBeenCalledWith({ where: { id: "a1", moderationStatus: "skipped" }, data: { moderationStatus: "pending" } });
    expect(enqueueAssetModeration).toHaveBeenCalledTimes(1);
    expect(enqueueAssetModeration).toHaveBeenCalledWith({ assetId: "a1", userId: "u1", s3Key: "uploads/u1/a1.mp4", mimeType: "video/mp4", kind: "video" });
    expect(r.queued).toBe(1);
  });

  it("re-queues skipped review attachments too", async () => {
    assetFindMany.mockResolvedValue([]);
    attachmentFindMany.mockResolvedValue([{ id: "r1", reviewId: "rev1", userId: "u1", s3Key: "k", mimeType: "image/png", kind: "image" }]);
    const r = await rescanSkippedUploads({ dryRun: false });
    expect(enqueueReviewAttachmentModeration).toHaveBeenCalledWith({
      attachmentId: "r1", reviewId: "rev1", userId: "u1", s3Key: "k", mimeType: "image/png", kind: "image",
    });
    expect(r).toEqual({ dryRun: false, assets: 0, attachments: 1, queued: 1 });
  });

  it("caps the batch size", async () => {
    await rescanSkippedUploads({ limit: 10_000 });
    expect(assetFindMany.mock.calls[0][0].take).toBe(500);
  });
});
