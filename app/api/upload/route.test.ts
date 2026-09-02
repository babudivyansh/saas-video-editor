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
  // Prisma always returns the generated timestamps; the fixture must too.
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
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
  s3KeyToPublicUrl: (k: string) => `https://bucket.example/${k}`,
  getS3ObjectSize: vi.fn(async () => 123),
}));
vi.mock("@/lib/asset-moderation", () => ({ enqueueAssetModeration: vi.fn() }));
vi.mock("@/lib/asset-audit", () => ({ auditAssetAction: vi.fn() }));
vi.mock("@/lib/onboarding-analytics", () => ({ trackOnboardingEvent: vi.fn() }));
vi.mock("@/lib/plans/tiers", () => ({
  storageLimitBytesForTier: () => 10 ** 12,
  maxUploadBytesForTier: () => 10 ** 12,
  ALLOWED_UPLOAD_MIME: /^(video|audio|image)\/(mp4|mpeg|quicktime|webm|x-matroska|mp3|wav|ogg|png|jpeg|jpg|webp|gif)$/,
  formatBytes: (n: number) => `${n} bytes`,
  TIER_LABEL: { creator: "Creator", pro: "Pro", studio: "Studio" },
}));
// Pass the handler through untouched so the test hits it directly.
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");

function uploadRequest(): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" }));
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

function skipAssetRequest(bytes: Uint8Array): NextRequest {
  const form = new FormData();
  form.append("file", new File([bytes], "avatar.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/upload?skipAsset=true", { method: "POST", body: form });
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

describe("POST /api/upload?skipAsset=true — avatar entitlement can no longer be bypassed (Upload Limits Audit §7/P1)", () => {
  it("rejects an oversized avatar BEFORE uploading to S3 — the response itself is not a 200", async () => {
    const uploadBufferToS3 = vi.mocked((await import("@/utils/s3-upload")).uploadBufferToS3);
    uploadBufferToS3.mockClear();
    // The shared tiers mock in this file sets maxUploadBytesForTier to a huge
    // number by default — override it for this test only, to something an
    // "avatar" can realistically exceed.
    const tiersMod = await import("@/lib/plans/tiers");
    vi.spyOn(tiersMod, "maxUploadBytesForTier").mockReturnValue(10); // 10 bytes, trivially exceeded

    const res = await POST(skipAssetRequest(new Uint8Array(50).fill(1)));
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(413);
    // The old bug: the S3 write happened unconditionally before any check.
    expect(uploadBufferToS3).not.toHaveBeenCalled();
  });

  it("still succeeds for a file within the plan's cap", async () => {
    const tiersMod = await import("@/lib/plans/tiers");
    vi.spyOn(tiersMod, "maxUploadBytesForTier").mockReturnValue(10 ** 9);
    const uploadBufferToS3 = vi.mocked((await import("@/utils/s3-upload")).uploadBufferToS3);
    uploadBufferToS3.mockResolvedValue("https://bucket.example/uploads/u1/avatar.png");

    const res = await POST(skipAssetRequest(new Uint8Array(50).fill(1)));
    expect(res.status).toBe(200);
    expect(uploadBufferToS3).toHaveBeenCalled();
  });
});
