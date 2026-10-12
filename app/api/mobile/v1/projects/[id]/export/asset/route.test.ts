import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// "Save to Assets" after an export: the render (renders/<id>.mp4, replaced by
// the next export) is copied to its own key and adopted as an editor Asset.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const prisma = {
  project: { findFirst: vi.fn() },
  pendingUpload: { create: vi.fn(async () => ({ id: "pu1" })), delete: vi.fn(async () => ({})) },
};
vi.mock("@/lib/prisma", () => ({ prisma }));
const copyS3Object = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({ copyS3Object, sanitizeS3Key: (k: string) => k }));
const { AssetLimitError } = await vi.importActual<typeof import("@/lib/asset-service")>("@/lib/asset-service");
const adoptExistingS3Object = vi.fn(async () => ({ asset: { id: "as9" } }));
vi.mock("@/lib/asset-service", () => ({ adoptExistingS3Object, AssetLimitError, assetLimitStatus: (k: string) => (k === "file_size" ? 413 : 402) }));
const getAsset = vi.fn(async (_u: string, id: string) => ({ id, name: "Launch.mp4", kind: "video", source: "editor" }));
vi.mock("@/lib/mobile/assets", () => ({ getAsset, include: {}, serialize: vi.fn() }));

const { POST } = await import("./route");

const call = (id = "p1") =>
  POST(new NextRequest(`http://localhost/api/mobile/v1/projects/${id}/export/asset`, { method: "POST", headers: { authorization: "Bearer acc" } }), { params: Promise.resolve({ id }) });
const doc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [{ id: "v1", type: "video", assetId: "a1", timelineStart: 0, duration: 12.5, srcIn: 0, volume: 1, muted: false }], text: [], audio: [], image: [], caption: [] } };

beforeEach(() => vi.clearAllMocks());

describe("POST /projects/:id/export/asset", () => {
  it("copies the render to its own key and saves it as an editor Asset", async () => {
    prisma.project.findFirst.mockResolvedValue({ title: "Launch", status: "completed", videoUrl: "https://b/renders/p1.mp4", editorDoc: doc });
    const res = await call();
    expect([res.status, await res.json()]).toEqual([201, { id: "as9", name: "Launch.mp4", kind: "video", source: "editor" }]);
    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "u1", productType: "editor" } }));
    const [from, to] = copyS3Object.mock.calls[0] as unknown as [string, string];
    expect(from).toBe("renders/p1.mp4");
    expect(to).toMatch(/^uploads\/u1\/[0-9a-f-]{36}\.mp4$/);
    expect(adoptExistingS3Object).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", s3Key: to, mimeType: "video/mp4", name: "Launch.mp4", sourceFeature: "editor", sourceProjectId: "p1", duration: 12.5, width: 1080, height: 1920 }));
    expect(prisma.pendingUpload.delete).toHaveBeenCalledWith({ where: { id: "pu1" } });
  });

  it("refuses before an export has finished, and other people's edits", async () => {
    prisma.project.findFirst.mockResolvedValue({ title: "Launch", status: "rendering", videoUrl: null, editorDoc: doc });
    const res = await call();
    expect([res.status, (await res.json()).code]).toEqual([409, "not_exported"]);
    prisma.project.findFirst.mockResolvedValue(null);
    expect((await call("theirs")).status).toBe(404);
    expect(copyS3Object).not.toHaveBeenCalled();
  });

  it("says when storage is full, leaving the copy for the cleanup cron", async () => {
    prisma.project.findFirst.mockResolvedValue({ title: "Launch", status: "completed", videoUrl: "https://b/renders/p1.mp4", editorDoc: doc });
    adoptExistingS3Object.mockRejectedValueOnce(new AssetLimitError("storage_quota", 100, 100, "Storage limit reached (5 GB on your plan)."));
    const res = await call();
    expect([res.status, await res.json()]).toEqual([402, expect.objectContaining({ error: "Storage limit reached (5 GB on your plan).", code: "storage_quota" })]);
    expect(prisma.pendingUpload.delete).not.toHaveBeenCalled();
  });
});
