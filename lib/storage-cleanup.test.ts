import { beforeEach, describe, expect, it, vi } from "vitest";

const deleted: string[] = [];
let assetRefs: Array<{ s3Key: string; thumbnailS3Key: string | null }> = [];

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/utils/s3-upload", () => ({ deleteS3Object: vi.fn(async (k: string) => { deleted.push(k); }) }));
vi.mock("@/lib/source-url", () => ({
  s3KeyFromStoredUrl: (url: string) => (url.startsWith("https://bucket/") ? url.slice("https://bucket/".length).split("?")[0] : null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: vi.fn(async () => [{
        uploadedVideoUrl: "https://bucket/uploads/u1/src.mp4?X-Amz-Signature=abc",
        videoUrl: null,
        clips: [
          { videoUrl: "https://bucket/renders/p1/clip-0.mp4", thumbnailUrl: "https://bucket/renders/p1/clip-0.jpg" },
          { videoUrl: "https://elsewhere.example/x.mp4", thumbnailUrl: null },
        ],
      }]),
    },
    asset: { findMany: vi.fn(async () => assetRefs) },
  },
}));

const { collectProjectMediaKeys, deleteUnreferencedKeys } = await import("./storage-cleanup");

beforeEach(() => {
  deleted.length = 0;
  assetRefs = [];
});

describe("storage cleanup", () => {
  it("collects only our own storage keys, signature stripped", async () => {
    expect((await collectProjectMediaKeys({ id: "p1" })).sort()).toEqual([
      "renders/p1/clip-0.jpg", "renders/p1/clip-0.mp4", "uploads/u1/src.mp4",
    ]);
  });

  it("never deletes a key the library still references", async () => {
    assetRefs = [{ s3Key: "uploads/u1/src.mp4", thumbnailS3Key: "renders/p1/clip-0.jpg" }];
    const n = await deleteUnreferencedKeys(["uploads/u1/src.mp4", "renders/p1/clip-0.mp4", "renders/p1/clip-0.jpg"], "test");
    expect(n).toBe(1);
    expect(deleted).toEqual(["renders/p1/clip-0.mp4"]);
  });
});
