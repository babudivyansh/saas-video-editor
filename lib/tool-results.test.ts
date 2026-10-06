import { beforeEach, describe, expect, it, vi } from "vitest";

const generationUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { generation: { update: generationUpdate } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
const uploadBufferToS3 = vi.fn(async (_b: Buffer, key: string) => `https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/${key}`);
vi.mock("@/utils/s3-upload", () => ({ uploadBufferToS3 }));
class AssetLimitError extends Error {
  constructor(readonly kind: string) {
    super("over");
  }
}
const adoptExistingS3Object = vi.fn();
vi.mock("@/lib/asset-service", () => ({ adoptExistingS3Object, AssetLimitError }));

const { saveToolResult } = await import("./tool-results");

const S3 = "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/voiceovers/u1/a.mp3";

beforeEach(() => {
  vi.clearAllMocks();
  adoptExistingS3Object.mockResolvedValue({ asset: { id: "as1" } });
});

describe("saveToolResult", () => {
  it("adopts an S3 result as an asset and records it on the Generation", async () => {
    const r = await saveToolResult({ userId: "u1", generationId: "g1", toolSlug: "voiceover", source: { s3Url: S3 }, mimeType: "audio/mpeg", name: "intro.mp3", durationMs: 4200, meta: { voiceId: "brian" } });
    expect(r).toEqual({ url: S3, assetId: "as1" });
    expect(adoptExistingS3Object).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", s3Key: "voiceovers/u1/a.mp3", sourceFeature: "voiceover", sourceJobId: "g1", duration: 4.2 }));
    expect(generationUpdate).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { result: { url: S3, mimeType: "audio/mpeg", name: "intro.mp3", durationMs: 4200, voiceId: "brian" }, resultAssetId: "as1" },
    });
  });

  it("stores bytes (the local-disk tools) in S3 first, with their real size", async () => {
    await saveToolResult({ userId: "u1", generationId: "g2", toolSlug: "vocal-remover", source: { buffer: Buffer.alloc(1234) }, mimeType: "audio/mpeg", name: "instrumental-song.mp3" });
    expect(uploadBufferToS3.mock.calls[0]![1]).toMatch(/^tool-results\/u1\/.+\.mp3$/);
    expect(adoptExistingS3Object.mock.calls[0]![0]).toMatchObject({ size: 1234, sourceFeature: "vocal-remover" });
  });

  it("still records the result when the library is full", async () => {
    adoptExistingS3Object.mockRejectedValue(new AssetLimitError("storage_quota"));
    const r = await saveToolResult({ userId: "u1", generationId: "g3", toolSlug: "image-generator", source: { s3Url: S3 }, mimeType: "image/png", name: "x.png" });
    expect(r.assetId).toBeNull();
    expect(generationUpdate.mock.calls[0]![0].data.resultAssetId).toBeNull();
  });

  it("never throws: a finished job stays finished", async () => {
    uploadBufferToS3.mockRejectedValueOnce(new Error("S3 down"));
    await expect(saveToolResult({ userId: "u1", generationId: "g4", toolSlug: "enhance-speech", source: { buffer: Buffer.alloc(1) }, mimeType: "audio/mpeg", name: "e.mp3" })).resolves.toEqual({ url: null, assetId: null });
  });
});
