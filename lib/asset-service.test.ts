import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Global Asset Library — core service tests. Mirrors the mocking convention
// established in app/api/upload/route.test.ts: mock the I/O boundaries
// (prisma, S3, auth, moderation, audit, analytics) and exercise the real
// lib/plans/tiers.ts so tier-boundary numbers are checked against the actual
// policy, not a stand-in.

let tier: "free" | "creator" | "pro" | "studio" = "free";

const assetStore = new Map<string, Record<string, unknown>>();
let nextId = 1;
async function findFirstDefault({ where }: { where: Record<string, unknown> }) {
  for (const row of assetStore.values()) {
    const matches = Object.entries(where).every(([k, v]) => row[k] === v);
    if (matches) return row;
  }
  return null;
}
const findFirstImpl = vi.fn(findFirstDefault);
async function createDefault({ data }: { data: Record<string, unknown> }) {
  const row = { id: `a${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data };
  assetStore.set(row.id as string, row);
  return row;
}
const createImpl = vi.fn(createDefault);
const aggregateImpl = vi.fn(async () => ({ _sum: { size: 0 } }));
const pendingCreateImpl = vi.fn(async () => ({ id: "pending1" }));
const pendingDeleteImpl = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findFirst: (...args: unknown[]) => (findFirstImpl as unknown as (...a: unknown[]) => unknown)(...args),
      create: (...args: unknown[]) => (createImpl as unknown as (...a: unknown[]) => unknown)(...args),
      aggregate: (...args: unknown[]) => (aggregateImpl as unknown as (...a: unknown[]) => unknown)(...args),
    },
    pendingUpload: {
      create: (...args: unknown[]) => (pendingCreateImpl as unknown as (...a: unknown[]) => unknown)(...args),
      delete: (...args: unknown[]) => (pendingDeleteImpl as unknown as (...a: unknown[]) => unknown)(...args),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getUserTier: vi.fn(async () => tier),
}));

const uploadBufferToS3 = vi.fn(async (_buf: Buffer, key: string) => `https://bucket.example/${key}`);
const deleteS3Object = vi.fn(async () => {});
const getS3ObjectSize = vi.fn(async () => 1024);
vi.mock("@/utils/s3-upload", () => ({
  uploadBufferToS3: (...a: unknown[]) => (uploadBufferToS3 as unknown as (...x: unknown[]) => unknown)(...a),
  getAssetReadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
  s3KeyToPublicUrl: (key: string) => `https://bucket.example/${key}`,
  sanitizeS3Key: (k: string) => k,
  extensionForMime: (m: string) => (m.startsWith("video") ? "mp4" : m.startsWith("audio") ? "mp3" : "png"),
  deleteS3Object: (...a: unknown[]) => (deleteS3Object as unknown as (...x: unknown[]) => unknown)(...a),
  getS3ObjectSize: (...a: unknown[]) => (getS3ObjectSize as unknown as (...x: unknown[]) => unknown)(...a),
}));

const enqueueAssetModeration = vi.fn();
vi.mock("@/lib/asset-moderation", () => ({
  enqueueAssetModeration: (...a: unknown[]) => enqueueAssetModeration(...a),
}));

const auditAssetAction = vi.fn(async () => {});
vi.mock("@/lib/asset-audit", () => ({
  auditAssetAction: (...a: unknown[]) => auditAssetAction(...a),
}));

const trackOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding-analytics", () => ({
  trackOnboardingEvent: (...a: unknown[]) => trackOnboardingEvent(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  adoptUploadedBytes,
  adoptExistingS3Object,
  assertUploadAllowed,
  AssetLimitError,
} = await import("./asset-service");

beforeEach(() => {
  tier = "free";
  assetStore.clear();
  nextId = 1;
  vi.clearAllMocks();
  // clearAllMocks resets call history, not implementations — a test that
  // overrides these would otherwise poison every test after it.
  findFirstImpl.mockImplementation(findFirstDefault);
  createImpl.mockImplementation(createDefault);
});

describe("adoptUploadedBytes", () => {
  it("creates an Asset, audits it, enqueues moderation, and tracks asset_uploaded", async () => {
    const bytes = Buffer.from("hello world");
    const result = await adoptUploadedBytes({
      userId: "u1",
      bytes,
      mimeType: "video/mp4",
      name: "clip.mp4",
      sourceFeature: "autoclip",
      sourceProjectId: "p1",
    });

    expect(result.duplicate).toBe(false);
    expect(result.asset.kind).toBe("video");
    expect(result.asset.sourceFeature).toBe("autoclip");
    expect(result.asset.sourceProjectId).toBe("p1");
    expect(result.asset.size).toBe(bytes.length);
    expect(auditAssetAction).toHaveBeenCalledWith("u1", "upload", expect.any(String), expect.any(Object));
    expect(enqueueAssetModeration).toHaveBeenCalledTimes(1);
    expect(trackOnboardingEvent).toHaveBeenCalledWith("u1", "asset_uploaded", expect.objectContaining({ sourceFeature: "autoclip" }));
    // PendingUpload was written before the S3 PUT and cleared after success.
    expect(pendingCreateImpl).toHaveBeenCalledTimes(1);
    expect(pendingDeleteImpl).toHaveBeenCalledTimes(1);
  });

  it("returns the existing asset on a checksum duplicate instead of storing a second copy", async () => {
    const bytes = Buffer.from("same bytes");
    const first = await adoptUploadedBytes({ userId: "u1", bytes, mimeType: "image/png", name: "a.png", sourceFeature: "upload" });
    uploadBufferToS3.mockClear();
    createImpl.mockClear();

    const second = await adoptUploadedBytes({ userId: "u1", bytes, mimeType: "image/png", name: "a-again.png", sourceFeature: "upload" });

    expect(second.duplicate).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(uploadBufferToS3).not.toHaveBeenCalled();
    expect(createImpl).not.toHaveBeenCalled();
  });

  it("rejects a file over the tier's per-file cap with a friendly upgrade message, before ever touching storage", async () => {
    tier = "free"; // 250 MB cap
    const oversized = Buffer.alloc(260 * 1024 ** 2);
    await expect(
      adoptUploadedBytes({ userId: "u1", bytes: oversized, mimeType: "video/mp4", name: "big.mp4", sourceFeature: "upload" }),
    ).rejects.toMatchObject({ name: "AssetLimitError", kind: "file_size" });
    expect(uploadBufferToS3).not.toHaveBeenCalled();
    expect(pendingCreateImpl).not.toHaveBeenCalled();
    expect(trackOnboardingEvent).toHaveBeenCalledWith("u1", "asset_upload_limit_reached", expect.objectContaining({ kind: "file_size" }));
  });

  it("allows the same file size on a higher tier (studio: 5 GB cap)", async () => {
    tier = "studio";
    const bytes = Buffer.alloc(300 * 1024 ** 2); // 300 MB — over free's cap, under studio's
    const result = await adoptUploadedBytes({ userId: "u1", bytes, mimeType: "video/mp4", name: "big.mp4", sourceFeature: "upload" });
    expect(result.duplicate).toBe(false);
  });

  it("rejects when the cumulative storage quota would be exceeded", async () => {
    aggregateImpl.mockResolvedValueOnce({ _sum: { size: 0.49 * 1024 ** 3 } }); // free tier: 0.5 GB limit
    const bytes = Buffer.alloc(20 * 1024 ** 2); // pushes usage past the free cap
    await expect(
      adoptUploadedBytes({ userId: "u1", bytes, mimeType: "video/mp4", name: "x.mp4", sourceFeature: "upload" }),
    ).rejects.toMatchObject({ name: "AssetLimitError", kind: "storage_quota" });
    expect(uploadBufferToS3).not.toHaveBeenCalled();
  });

  it("leaves no orphan when the S3 upload fails — PendingUpload is cleaned up, no Asset row", async () => {
    uploadBufferToS3.mockRejectedValueOnce(new Error("network down"));
    await expect(
      adoptUploadedBytes({ userId: "u1", bytes: Buffer.from("x"), mimeType: "video/mp4", name: "x.mp4", sourceFeature: "upload" }),
    ).rejects.toThrow("Upload failed");
    expect(pendingCreateImpl).toHaveBeenCalledTimes(1);
    expect(pendingDeleteImpl).toHaveBeenCalledTimes(1); // cleaned up despite the failure
    expect(createImpl).not.toHaveBeenCalled();
    expect(trackOnboardingEvent).toHaveBeenCalledWith("u1", "asset_upload_failed", expect.objectContaining({ reason: "s3" }));
  });

  it("compensates a DB failure after a successful S3 PUT by deleting the object", async () => {
    createImpl.mockRejectedValueOnce(new Error("db down"));
    await expect(
      adoptUploadedBytes({ userId: "u1", bytes: Buffer.from("x"), mimeType: "video/mp4", name: "x.mp4", sourceFeature: "upload" }),
    ).rejects.toThrow("Upload failed");
    expect(deleteS3Object).toHaveBeenCalledTimes(1);
    expect(pendingDeleteImpl).toHaveBeenCalledTimes(1);
  });
});

describe("adoptUploadedBytes — concurrent duplicate", () => {
  // findFirst-then-create is check-then-act against @@unique([userId, checksum]).
  // Two simultaneous uploads of the same file both miss the check, and the
  // loser hits the constraint. That is a duplicate, not a failure — the user's
  // file is safely in the library, so telling them "Upload failed" is both
  // wrong and alarming.
  it("returns the winning row instead of failing when the unique index rejects the insert", async () => {
    const bytes = Buffer.from("racing bytes");

    // Simulate the race: the pre-check sees nothing, the insert loses, and the
    // post-conflict lookup finds the row the winner just wrote.
    const winner = {
      id: "winner-1",
      userId: "u1",
      s3Key: "uploads/u1/winner.png",
      kind: "image",
      size: bytes.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let lookups = 0;
    findFirstImpl.mockImplementation(async () => {
      lookups += 1;
      return lookups === 1 ? null : winner; // miss, then find the winner
    });
    createImpl.mockRejectedValueOnce(
      Object.assign(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })),
    );

    const result = await adoptUploadedBytes({
      userId: "u1", bytes, mimeType: "image/png", name: "race.png", sourceFeature: "upload",
    });

    expect(result.duplicate).toBe(true);
    expect(result.asset.id).toBe("winner-1");
    // Our now-redundant object must not be left orphaned in S3.
    expect(deleteS3Object).toHaveBeenCalled();
  });

  it("still fails loudly when the insert breaks for some other reason", async () => {
    findFirstImpl.mockResolvedValue(null);
    createImpl.mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      adoptUploadedBytes({
        userId: "u1", bytes: Buffer.from("x"), mimeType: "image/png", name: "x.png", sourceFeature: "upload",
      }),
    ).rejects.toThrow("Upload failed");
    expect(deleteS3Object).toHaveBeenCalled();
  });
});

describe("adoptExistingS3Object", () => {
  it("creates an Asset referencing the existing key without a second S3 put", async () => {
    const result = await adoptExistingS3Object({
      userId: "u1",
      s3Key: "uploads/u1/imported.mp4",
      mimeType: "video/mp4",
      name: "Imported video",
      size: 5000,
      sourceFeature: "url-import",
      sourceProjectId: "p1",
    });
    expect(result.duplicate).toBe(false);
    expect(result.asset.s3Key).toBe("uploads/u1/imported.mp4");
    expect(uploadBufferToS3).not.toHaveBeenCalled();
    expect(enqueueAssetModeration).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — adopting the same key twice returns the same Asset, no duplicate row", async () => {
    const opts = {
      userId: "u1", s3Key: "uploads/u1/same.mp4", mimeType: "video/mp4",
      name: "Same", size: 100, sourceFeature: "url-import" as const,
    };
    const first = await adoptExistingS3Object(opts);
    createImpl.mockClear();
    const second = await adoptExistingS3Object(opts);
    expect(second.duplicate).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(createImpl).not.toHaveBeenCalled();
  });

  it("respects skipModeration for licensed/pre-vetted content", async () => {
    const result = await adoptExistingS3Object({
      userId: "u1", s3Key: "stock-imports/u1/x.jpg", mimeType: "image/jpeg",
      name: "Stock", size: 100, sourceFeature: "stock", skipModeration: true,
    });
    expect(result.asset.moderationStatus).toBe("skipped");
    expect(enqueueAssetModeration).not.toHaveBeenCalled();
  });

  it("fetches the size via HEAD when not provided by the caller", async () => {
    await adoptExistingS3Object({
      userId: "u1", s3Key: "uploads/u1/no-size.mp4", mimeType: "video/mp4",
      name: "No size given", sourceFeature: "autoclip",
    });
    expect(getS3ObjectSize).toHaveBeenCalledWith("uploads/u1/no-size.mp4");
  });
});

describe("assertUploadAllowed — multipart pre-flight (no dedup, declared size only)", () => {
  it("enforces the same per-tier cap as adoptUploadedBytes", async () => {
    tier = "free";
    await expect(assertUploadAllowed("u1", 300 * 1024 ** 2)).rejects.toBeInstanceOf(AssetLimitError);
    tier = "studio";
    await expect(assertUploadAllowed("u1", 300 * 1024 ** 2)).resolves.toBe("studio");
  });
});
