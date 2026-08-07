import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression test for the duplicate-upload bug: re-uploading a video whose bytes
// already exist as an Asset returned a response with no top-level `url`, so
// useVideoGenerate.uploadVideo() read `data.url` as undefined and AutoClip (and
// split-screen / streamer-video) created a project with a null source, then
// failed analysis with "Project has no uploaded video".

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getUserTier: vi.fn(async () => "free"),
}));

const existingAsset = {
  id: "a1",
  userId: "u1",
  name: "clip.mp4",
  s3Key: "uploads/u1/existing.mp4",
  url: "s3://stale-direct",
  mimeType: "video/mp4",
  kind: "video",
  size: 123,
  checksum: "deadbeef",
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findFirst: vi.fn(async () => existingAsset),
      aggregate: vi.fn(async () => ({ _sum: { size: 0 } })),
      create: vi.fn(),
    },
    pendingUpload: { create: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/utils/s3-upload", () => ({
  uploadBufferToS3: vi.fn(),
  getAssetReadUrl: vi.fn(async () => "https://signed.example/read-url"),
  sanitizeS3Key: (k: string) => k,
  extensionForMime: () => "mp4",
  deleteS3Object: vi.fn(),
}));
vi.mock("@/lib/asset-moderation", () => ({ enqueueAssetModeration: vi.fn() }));
vi.mock("@/lib/asset-audit", () => ({ auditAssetAction: vi.fn() }));
vi.mock("@/lib/plans/tiers", () => ({ storageLimitBytesForTier: () => 10 ** 12 }));
// Pass the handler through untouched so the test hits it directly.
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");

function uploadRequest(): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" }));
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

beforeEach(() => {
  authUser = { userId: "u1" };
});

describe("POST /api/upload — duplicate response shape", () => {
  it("returns a top-level url (and key) on a duplicate so uploadVideo() can read data.url", async () => {
    const res = await POST(uploadRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    // The bug: these were absent, so the AutoClip project got a null source.
    expect(json.url).toBe("https://signed.example/read-url");
    expect(json.key).toBe(existingAsset.s3Key);
    expect(json.asset.url).toBe("https://signed.example/read-url");
  });
});
