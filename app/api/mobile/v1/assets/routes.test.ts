import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Asset, folder and upload routes wrap the web ones; those and S3 are
// stand-ins here. What's tested: field translation, the archive-then-delete
// rule, the part-URL batch, and that a foreign upload session is refused.

const webAssetPatch = vi.fn();
const webAssetDelete = vi.fn();
const webCreate = vi.fn();
const webComplete = vi.fn();
const webStats = vi.fn();
vi.mock("@/app/api/assets/[id]/route", () => ({ PATCH: webAssetPatch, DELETE: webAssetDelete }));
vi.mock("@/app/api/assets/route", () => ({ GET: webStats }));
vi.mock("@/app/api/upload/multipart/create/route", () => ({ POST: webCreate }));
vi.mock("@/app/api/upload/multipart/complete/route", () => ({ POST: webComplete }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const getAsset = vi.fn();
const COUNTS = { video: 4, audio: 1, image: 2, archived: 3 };
vi.mock("@/lib/mobile/assets", () => ({ getAsset, assetCounts: vi.fn(async () => COUNTS), UPLOAD_PART_BYTES: 10 * 1024 * 1024 }));
const partUrl = vi.fn(async (_k: string, _u: string, n: number) => `https://s3/part-${n}`);
vi.mock("@/utils/s3-upload", () => ({ getMultipartPartUploadUrl: partUrl }));
const getOwnedPendingUpload = vi.fn();
vi.mock("@/lib/pending-upload", () => ({ getOwnedPendingUpload }));

const asset = await import("./[id]/route");
const archive = (await import("./[id]/archive/route")).POST;
const storage = (await import("./storage/route")).GET;
const startUpload = (await import("../uploads/route")).POST;
const partUrls = (await import("../uploads/part-urls/route")).POST;
const complete = (await import("../uploads/complete/route")).POST;

const req = (method: string, body?: unknown, url = "http://localhost/api/mobile/v1/assets/a1") =>
  new NextRequest(url, { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = { params: Promise.resolve({ id: "a1" }) };
const sentBody = async (m: ReturnType<typeof vi.fn>) => (m.mock.calls[0]![0] as NextRequest).json();

beforeEach(() => vi.clearAllMocks());

describe("assets", () => {
  it("translates favorite → isFavorite and passes folder moves through", async () => {
    webAssetPatch.mockResolvedValue(NextResponse.json({}));
    getAsset.mockResolvedValue({ id: "a1", favorite: true });
    await asset.PATCH(req("PATCH", { favorite: true, folderId: null }), ctx);
    expect(await sentBody(webAssetPatch)).toEqual({ folderId: null, isFavorite: true });
  });

  it("archives first, and deletes for good only what's archived", async () => {
    getAsset.mockResolvedValue({ id: "a1", archivedAt: null });
    const refused = await asset.DELETE(req("DELETE"), ctx);
    expect([refused.status, (await refused.json()).code]).toEqual([409, "not_archived"]);
    expect(webAssetDelete).not.toHaveBeenCalled();

    webAssetDelete.mockResolvedValue(NextResponse.json({ status: "archived" }));
    await archive(req("POST"), ctx);
    expect(webAssetDelete).toHaveBeenCalledOnce();

    getAsset.mockResolvedValue({ id: "a1", archivedAt: "2026-10-06T00:00:00Z" });
    webAssetDelete.mockResolvedValue(NextResponse.json({ status: "deleted" }));
    expect(await (await asset.DELETE(req("DELETE"), ctx)).json()).toEqual({ ok: true });
    // Archiving an archived file is a no-op, not a second (destructive) DELETE.
    webAssetDelete.mockClear();
    await archive(req("POST"), ctx);
    expect(webAssetDelete).not.toHaveBeenCalled();
  });

  it("reads storage from the web's stats", async () => {
    webStats.mockResolvedValue(NextResponse.json({ usedBytes: 5, limitBytes: 15, maxUploadBytes: 3, count: 2, byKind: {} }));
    expect(await (await storage(req("GET", undefined, "http://localhost/api/mobile/v1/assets/storage"))).json()).toEqual({ usedBytes: 5, limitBytes: 15, maxUploadBytes: 3, count: 2, counts: COUNTS });
    expect((webStats.mock.calls[0]![0] as NextRequest).nextUrl.searchParams.get("stats")).toBe("true");
  });
});

describe("uploads", () => {
  it("starts a multipart upload and hands back every part's URL", async () => {
    webCreate.mockResolvedValue(NextResponse.json({ key: "uploads/u1/x.mp4", uploadId: "up1" }));
    const res = await startUpload(req("POST", { name: "ep42.mp4", mimeType: "video/mp4", sizeBytes: 25 * 1024 * 1024 }, "http://localhost/api/mobile/v1/uploads"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ key: "uploads/u1/x.mp4", uploadId: "up1", partSizeBytes: 10485760 });
    expect(body.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2, 3]);
    expect(await sentBody(webCreate)).toEqual({ name: "ep42.mp4", mimeType: "video/mp4", size: 26214400 });
  });

  it("passes the web's quota refusal through, with no part URLs", async () => {
    webCreate.mockResolvedValue(NextResponse.json({ error: "This file is over your plan's 2 GB limit" }, { status: 413 }));
    const res = await startUpload(req("POST", { name: "big.mp4", mimeType: "video/mp4", sizeBytes: 9e9 }, "http://localhost/api/mobile/v1/uploads"));
    expect([res.status, (await res.json()).error]).toEqual([413, "This file is over your plan's 2 GB limit"]);
    expect(partUrl).not.toHaveBeenCalled();
  });

  it("gives fresh part URLs only for the caller's own upload", async () => {
    getOwnedPendingUpload.mockResolvedValue(null);
    expect((await partUrls(req("POST", { key: "k", uploadId: "u", partNumbers: [4] }))).status).toBe(404);
    getOwnedPendingUpload.mockResolvedValue({ id: "p" });
    expect(await (await partUrls(req("POST", { key: "k", uploadId: "u", partNumbers: [4, 4, 5] }))).json()).toEqual({
      parts: [{ partNumber: 4, url: "https://s3/part-4" }, { partNumber: 5, url: "https://s3/part-5" }],
    });
  });

  it("completes with the parts in order, in the web's format", async () => {
    webComplete.mockResolvedValue(NextResponse.json({ asset: { id: "a9" } }));
    getAsset.mockResolvedValue({ id: "a9", name: "ep42.mp4" });
    const res = await complete(req("POST", { key: "k", uploadId: "u", name: "ep42.mp4", mimeType: "video/mp4", durationSec: 61.5, parts: [{ partNumber: 2, etag: "e2" }, { partNumber: 1, etag: "e1" }] }));
    expect(res.status).toBe(201);
    expect(await sentBody(webComplete)).toEqual({ key: "k", uploadId: "u", name: "ep42.mp4", mimeType: "video/mp4", duration: 61.5, parts: [{ PartNumber: 1, ETag: "e1" }, { PartNumber: 2, ETag: "e2" }] });
  });
});
