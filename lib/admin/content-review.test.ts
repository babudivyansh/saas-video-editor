import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  asset: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  clip: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
}));
const deleteContent = vi.hoisted(() => vi.fn());
const clipDeleteBlocker = vi.hoisted(() => vi.fn());
const deleteClipAndMedia = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: vi.fn(async (k: string) => `https://signed/${k}`) }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => (u ? `${u}?signed` : null)) }));
vi.mock("@/lib/admin/content", () => ({ deleteContent }));
vi.mock("@/lib/clip-delete", () => ({ clipDeleteBlocker, deleteClipAndMedia }));

const { applyReview, listReviewQueue, reviewMedia } = await import("./content-review");

beforeEach(() => vi.clearAllMocks());

describe("listReviewQueue", () => {
  it("lists pending user uploads oldest first, excluding stock + AutoClip renders and flagged rows", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "a1", name: "up.mp4", kind: "video", mimeType: "video/mp4", size: BigInt(10), duration: 12, sourceFeature: "upload",
        thumbnailS3Key: "t/a1.jpg", moderationStatus: "clean", moderationLabels: null, createdAt: new Date(0), adminReviewedAt: null,
        user: { id: "u1", email: "u@x.com" },
      },
    ]);
    const { items, nextCursor } = await listReviewQueue({ kind: "asset", filter: "pending" });
    const args = prismaMock.asset.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      sourceFeature: { notIn: ["stock", "autoclip"] },
      moderationStatus: { not: "flagged" },
      adminReviewedAt: null,
    });
    expect(args.orderBy[0]).toEqual({ createdAt: "asc" });
    expect(items[0]).toMatchObject({ id: "a1", thumbnailUrl: "https://signed/t/a1.jpg", sizeBytes: 10, owner: { email: "u@x.com" } });
    expect(nextCursor).toBeNull();
  });

  it("flagged tab reads every flagged asset and sorts its labels by confidence", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "a2", name: "x.jpg", kind: "image", mimeType: "image/jpeg", size: BigInt(1), duration: null, sourceFeature: "upload",
        thumbnailS3Key: null, moderationStatus: "flagged",
        moderationLabels: { labels: [{ name: "Violence", confidence: 81 }, { name: "Explicit", confidence: 97 }] },
        createdAt: new Date(0), adminReviewedAt: null, user: { id: "u1", email: "u@x.com" },
      },
    ]);
    const { items } = await listReviewQueue({ kind: "clip", filter: "flagged" });
    expect(prismaMock.asset.findMany.mock.calls[0][0].where).toEqual({ moderationStatus: "flagged" });
    expect(items[0].mediaKind).toBe("image");
    expect(items[0].labels.map((l) => l.name)).toEqual(["Explicit", "Violence"]);
  });

  it("lists ready clips with their owner via the project", async () => {
    prismaMock.clip.findMany.mockResolvedValue([
      {
        id: "c1", title: null, thumbnailUrl: "https://b/t.jpg", durationSec: 30, aspectRatio: "9:16", createdAt: new Date(0), adminReviewedAt: null,
        project: { id: "p1", title: "Pod", user: { id: "u2", email: "o@x.com" } },
      },
    ]);
    const { items } = await listReviewQueue({ kind: "clip", filter: "pending" });
    expect(prismaMock.clip.findMany.mock.calls[0][0].where).toMatchObject({ status: "ready", adminReviewedAt: null });
    expect(items[0]).toMatchObject({ kind: "clip", title: "(untitled clip)", thumbnailUrl: "https://b/t.jpg?signed", owner: { id: "u2" } });
  });
});

describe("reviewMedia", () => {
  it("signs an asset's key and a clip's render", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ s3Key: "u/a.mp4", mimeType: "video/mp4", userId: "u1" });
    await expect(reviewMedia("asset", "a1")).resolves.toEqual({ url: "https://signed/u/a.mp4", mimeType: "video/mp4", ownerId: "u1" });
    prismaMock.clip.findUnique.mockResolvedValue({ videoUrl: "https://b/c.mp4", project: { userId: "u2" } });
    await expect(reviewMedia("clip", "c1")).resolves.toMatchObject({ url: "https://b/c.mp4?signed", ownerId: "u2" });
  });

  it("returns null for a clip with no render", async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ videoUrl: null, project: { userId: "u2" } });
    await expect(reviewMedia("clip", "c1")).resolves.toBeNull();
  });
});

describe("applyReview", () => {
  it("approving a flagged upload marks it reviewed and clean", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ userId: "u1", name: "x", moderationStatus: "flagged" });
    const r = await applyReview("asset", "a1", "approve", "admin1");
    expect(r).toMatchObject({ ok: true, ownerId: "u1" });
    expect(prismaMock.asset.update.mock.calls[0][0].data).toMatchObject({ adminReviewedById: "admin1", moderationStatus: "clean" });
  });

  it("approving a clean upload leaves its scan status alone", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ userId: "u1", name: "x", moderationStatus: "skipped" });
    await applyReview("asset", "a1", "approve", "admin1");
    expect(prismaMock.asset.update.mock.calls[0][0].data).not.toHaveProperty("moderationStatus");
  });

  it("removing an upload deletes it with its files", async () => {
    prismaMock.asset.findUnique.mockResolvedValue({ userId: "u1", name: "x", moderationStatus: "clean" });
    await applyReview("asset", "a1", "remove", "admin1");
    expect(deleteContent).toHaveBeenCalledWith("asset", ["a1"]);
  });

  it("won't remove a clip that is still rendering", async () => {
    prismaMock.clip.findUnique.mockResolvedValue({ id: "c1", title: "t", status: "rendering", videoUrl: null, thumbnailUrl: null, project: { userId: "u2" } });
    clipDeleteBlocker.mockResolvedValue("still rendering");
    await expect(applyReview("clip", "c1", "remove", "admin1")).resolves.toEqual({ ok: false, status: 409, error: "still rendering" });
    expect(deleteClipAndMedia).not.toHaveBeenCalled();
  });

  it("removes a finished clip against its owner's library", async () => {
    const clip = { id: "c1", title: "t", status: "ready", videoUrl: "https://b/c.mp4", thumbnailUrl: null, project: { userId: "u2" } };
    prismaMock.clip.findUnique.mockResolvedValue(clip);
    clipDeleteBlocker.mockResolvedValue(null);
    await applyReview("clip", "c1", "remove", "admin1");
    expect(deleteClipAndMedia).toHaveBeenCalledWith(clip, "u2");
  });

  it("404s a missing item", async () => {
    prismaMock.clip.findUnique.mockResolvedValue(null);
    await expect(applyReview("clip", "nope", "approve", "admin1")).resolves.toMatchObject({ ok: false, status: 404 });
  });
});
