import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Security regression tests for the multipart-completion size-verification
// fix (Upload Limits Audit §6/P1): the finalize step must trust S3's own
// HeadObject ContentLength, never a client-declared `size`.

let tier: "free" | "creator" | "pro" | "studio" = "free";
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));

const pendingRow = { id: "pending1", userId: "u1", s3Key: "uploads/u1/big.mp4", uploadId: "up1" };
const getOwnedPendingUpload = vi.fn(async () => pendingRow);
vi.mock("@/lib/pending-upload", () => ({
  getOwnedPendingUpload: (...a: unknown[]) => getOwnedPendingUpload(...a),
}));

const assetStore = new Map<string, Record<string, unknown>>();
const aggregateImpl = vi.fn(async () => ({ _sum: { size: 0 } }));
const assetCreateImpl = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
  const row = { id: "a1", ...data };
  assetStore.set(row.id as string, row);
  return row;
});
const pendingDelete = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findFirst: vi.fn(async () => null),
      create: (...a: unknown[]) => (assetCreateImpl as unknown as (...x: unknown[]) => unknown)(...a),
      aggregate: (...a: unknown[]) => (aggregateImpl as unknown as (...x: unknown[]) => unknown)(...a),
    },
    pendingUpload: {
      delete: (...a: unknown[]) => (pendingDelete as unknown as (...x: unknown[]) => unknown)(...a),
    },
  },
}));

let actualObjectBytes = 0; // what S3's HeadObject "really" reports in this test
const completeMultipartUpload = vi.fn(async () => {});
const deleteS3Object = vi.fn(async () => {});
const getS3ObjectSize = vi.fn(async () => actualObjectBytes);
vi.mock("@/utils/s3-upload", () => ({
  completeMultipartUpload: (...a: unknown[]) => completeMultipartUpload(...a),
  deleteS3Object: (...a: unknown[]) => deleteS3Object(...a),
  getS3ObjectSize: (...a: unknown[]) => getS3ObjectSize(...a),
  getAssetReadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
  s3KeyToPublicUrl: (key: string) => `https://bucket.example/${key}`,
}));

vi.mock("@/lib/asset-moderation", () => ({ enqueueAssetModeration: vi.fn() }));
vi.mock("@/lib/asset-audit", () => ({ auditAssetAction: vi.fn() }));
vi.mock("@/lib/onboarding-analytics", () => ({ trackOnboardingEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");

function completeRequest(declaredSize: number): NextRequest {
  return new NextRequest("http://localhost/api/upload/multipart/complete", {
    method: "POST",
    body: JSON.stringify({
      key: "uploads/u1/big.mp4",
      uploadId: "up1",
      parts: [{ ETag: "etag1", PartNumber: 1 }],
      name: "big.mp4",
      mimeType: "video/mp4",
      size: declaredSize, // client-controlled — must never be trusted for entitlement
    }),
  });
}

beforeEach(() => {
  tier = "free";
  assetStore.clear();
  vi.clearAllMocks();
  getOwnedPendingUpload.mockResolvedValue(pendingRow);
  aggregateImpl.mockResolvedValue({ _sum: { size: 0 } });
});

describe("POST /api/upload/multipart/complete — authoritative size verification", () => {
  it("Scenario A: Free plan, declared 100MB, actual object 260MB — REJECT on real ContentLength", async () => {
    tier = "free";
    actualObjectBytes = 260 * 1024 ** 2;
    const res = await POST(completeRequest(100 * 1024 ** 2));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.actualBytes).toBe(actualObjectBytes);
    expect(deleteS3Object).toHaveBeenCalledWith("uploads/u1/big.mp4");
    expect(pendingDelete).toHaveBeenCalled();
  });

  it("Scenario B: Creator plan declares 500MB, actual object 1.1GB — REJECT", async () => {
    tier = "creator"; // 1GB cap
    actualObjectBytes = 1.1 * 1024 ** 3;
    const res = await POST(completeRequest(500 * 1024 ** 2));
    expect(res.status).toBe(413);
    expect(deleteS3Object).toHaveBeenCalled();
  });

  it("Scenario C: actual object exactly at the tier limit — PASS", async () => {
    tier = "free";
    actualObjectBytes = 250 * 1024 ** 2; // exactly free's cap
    const res = await POST(completeRequest(1)); // declared size is irrelevant/ignored
    expect(res.status).toBe(200);
    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it("Scenario D: actual object 1 byte above the tier limit — REJECT", async () => {
    tier = "free";
    actualObjectBytes = 250 * 1024 ** 2 + 1;
    const res = await POST(completeRequest(1));
    expect(res.status).toBe(413);
    expect(deleteS3Object).toHaveBeenCalled();
  });

  it("a small declared size cannot mask a real oversized object (the core bypass this fix closes)", async () => {
    tier = "free";
    actualObjectBytes = 5 * 1024 ** 3; // 5GB actually uploaded across parts
    const res = await POST(completeRequest(1024)); // client claims 1KB
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.actualBytes).toBe(actualObjectBytes);
  });

  it("never creates an Asset row when the real size violates entitlement", async () => {
    tier = "free";
    actualObjectBytes = 300 * 1024 ** 2;
    await POST(completeRequest(1));
    expect(assetCreateImpl).not.toHaveBeenCalled();
  });
});
