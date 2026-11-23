// POST /api/sample-projects/[id]: a sample video becomes an Asset that points
// at the one shared object, so AutoClip's ownership check passes for it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAuthUser = vi.fn(async () => ({ userId: "u1" }) as { userId: string } | null);
vi.mock("@/lib/auth", () => ({ getAuthUser: () => getAuthUser() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

class AssetLimitError extends Error {
  constructor(public readonly kind: "file_size" | "storage_quota", message: string) { super(message); }
}
const adoptExistingS3Object = vi.fn();
vi.mock("@/lib/asset-service", () => ({
  adoptExistingS3Object: (o: unknown) => adoptExistingS3Object(o),
  AssetLimitError,
  assetLimitStatus: (kind: string) => (kind === "storage_quota" ? 507 : 413),
}));
vi.mock("@/lib/asset-serialize", () => ({
  serializeOneAsset: vi.fn(async (a: { id: string; archivedAt: Date | null }) => ({ id: a.id, archivedAt: a.archivedAt })),
}));
const update = vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => ({ id: a.where.id, ...a.data }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { update: (a: never) => update(a) } } }));

const { POST } = await import("./route");
const call = (id: string) =>
  POST(new NextRequest(`http://localhost/api/sample-projects/${id}`, { method: "POST" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUser.mockResolvedValue({ userId: "u1" });
  adoptExistingS3Object.mockResolvedValue({ asset: { id: "a1", archivedAt: null, url: "https://signed" }, duplicate: false });
});

describe("POST /api/sample-projects/[id]", () => {
  it("adopts the shared object as the user's own asset, unmoderated, with its still", async () => {
    const res = await call("podcast");
    expect(res.status).toBe(201);
    expect(adoptExistingS3Object).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1",
      s3Key: "samples/podcast.mp4",
      thumbnailS3Key: "samples/podcast.jpg",
      sourceFeature: "sample",
      skipModeration: true,
      duration: 600,
    }));
    expect((await res.json()).asset.id).toBe("a1");
  });

  it("returns the row the user already has on a second pick, restoring it if archived", async () => {
    adoptExistingS3Object.mockResolvedValue({ asset: { id: "a1", archivedAt: new Date(), url: "u" }, duplicate: true });
    const res = await call("gaming");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { archivedAt: null } });
  });

  it("404s an unknown sample and 401s a signed-out caller", async () => {
    expect((await call("../uploads/u2/x")).status).toBe(404);
    getAuthUser.mockResolvedValue(null);
    expect((await call("podcast")).status).toBe(401);
    expect(adoptExistingS3Object).not.toHaveBeenCalled();
  });

  it("passes the storage limit through, and a missing file through as 503", async () => {
    adoptExistingS3Object.mockRejectedValueOnce(new AssetLimitError("storage_quota", "Storage full"));
    const full = await call("vlog");
    expect(full.status).toBe(507);
    expect((await full.json()).error).toBe("Storage full");

    adoptExistingS3Object.mockRejectedValueOnce(Object.assign(new Error("NotFound"), { name: "NotFound" }));
    expect((await call("vlog")).status).toBe(503);
  });
});
