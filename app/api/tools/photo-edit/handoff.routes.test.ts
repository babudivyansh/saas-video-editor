import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { aspectForImage } from "@/lib/photo-edit/ratios";

// Photo Edit hand-offs: "Send to video editor" and "Use as clip thumbnail".

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/asset-serialize", () => ({ serializeOneAsset: vi.fn(async (a: { id: string }) => ({ id: a.id, url: "signed" })) }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string) => `${u}?signed`) }));

type AssetRow = { id: string; userId: string; name: string; kind: string; s3Key: string; size: bigint; width: number | null; height: number | null };
const assets: AssetRow[] = [
  { id: "img", userId: "u1", name: "beach-edited.png", kind: "image", s3Key: "tool-results/u1/a.png", size: 1000n, width: 1600, height: 900 },
  { id: "vid", userId: "u1", name: "clip.mp4", kind: "video", s3Key: "uploads/u1/v.mp4", size: 1000n, width: null, height: null },
  { id: "theirs", userId: "u2", name: "x.png", kind: "image", s3Key: "uploads/u2/x.png", size: 1000n, width: 10, height: 10 },
];
const clips = [
  { id: "c1", owner: "u1", thumbnailUrl: "https://bucket.s3.us-east-1.amazonaws.com/renders/p1/clip-1.jpg", aspectRatio: "9:16" },
  { id: "c2", owner: "u2", thumbnailUrl: null, aspectRatio: "9:16" },
];
const projectCreate = vi.fn(async () => ({ id: "proj-new" }));
const clipUpdate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => assets.find((a) => a.id === where.id && a.userId === where.userId) ?? null) },
    clip: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; project: { userId: string } } }) => {
        const c = clips.find((x) => x.id === where.id && x.owner === where.project.userId);
        return c ? { id: c.id, thumbnailUrl: c.thumbnailUrl, aspectRatio: c.aspectRatio } : null;
      }),
      update: (...a: unknown[]) => clipUpdate(...a),
    },
    project: { create: (...a: unknown[]) => projectCreate(...a) },
  },
}));

const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#2a6" } }).png().toBuffer();
const uploadBufferToS3 = vi.fn(async (_b: Buffer, key: string) => `https://bucket.s3.us-east-1.amazonaws.com/${key}`);
const deleteS3Object = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({
  downloadS3ObjectToBuffer: vi.fn(async () => photo),
  uploadBufferToS3: (...a: Parameters<typeof uploadBufferToS3>) => uploadBufferToS3(...a),
  deleteS3Object: (...a: unknown[]) => deleteS3Object(...a),
}));

const toEditor = (await import("./to-editor/route")).POST;
const setThumbnail = (await import("./set-thumbnail/route")).POST;
const post = (fn: (r: NextRequest) => Promise<Response>, body: unknown) =>
  fn(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => vi.clearAllMocks());

describe("aspectForImage", () => {
  it("picks the closest editor shape", () => {
    expect([aspectForImage(1600, 900), aspectForImage(900, 1600), aspectForImage(1000, 1000), aspectForImage(null, null)]).toEqual(["16:9", "9:16", "1:1", "9:16"]);
  });
});

describe("POST /api/tools/photo-edit/to-editor", () => {
  it("creates an editor project with the photo on the image track, shaped like the photo", async () => {
    const res = await post(toEditor, { assetId: "img" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ editorProjectId: "proj-new", asset: { id: "img", url: "signed" } });
    const data = (projectCreate.mock.calls[0][0] as { data: { productType: string; title: string; sourceAssetId: string; editorDoc: { aspect: string; tracks: { image: { assetId: string; duration: number }[]; video: unknown[] } } } }).data;
    expect(data).toMatchObject({ productType: "editor", title: "beach-edited", sourceAssetId: "img" });
    expect(data.editorDoc.aspect).toBe("16:9");
    expect(data.editorDoc.tracks.image).toEqual([expect.objectContaining({ assetId: "img", timelineStart: 0, duration: 5 })]);
    expect(data.editorDoc.tracks.video).toEqual([]);
  });

  it("refuses someone else's photo and a video", async () => {
    expect((await post(toEditor, { assetId: "theirs" })).status).toBe(404);
    expect((await post(toEditor, { assetId: "vid" })).status).toBe(400);
    expect(projectCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/tools/photo-edit/set-thumbnail", () => {
  it("crops the photo to the clip's shape, points the clip at a new key and deletes the old cover", async () => {
    const res = await post(setThumbnail, { assetId: "img", clipId: "c1" });
    expect(res.status).toBe(200);
    const [buf, key, mime] = uploadBufferToS3.mock.calls[0];
    expect(key).toMatch(/^thumbnails\/u1\/c1-[0-9a-f]{8}\.jpg$/);
    expect(mime).toBe("image/jpeg");
    const meta = await sharp(buf).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([720, 1280, "jpeg"]);
    expect(clipUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { thumbnailUrl: `https://bucket.s3.us-east-1.amazonaws.com/${key}` } });
    expect(deleteS3Object).toHaveBeenCalledWith("renders/p1/clip-1.jpg");
    expect((await res.json()).thumbnailUrl).toContain("?signed");
  });

  it("refuses a clip in someone else's project, before writing anything", async () => {
    const res = await post(setThumbnail, { assetId: "img", clipId: "c2" });
    expect(res.status).toBe(404);
    expect(uploadBufferToS3).not.toHaveBeenCalled();
    expect(clipUpdate).not.toHaveBeenCalled();
  });

  it("refuses a video asset", async () => {
    expect((await post(setThumbnail, { assetId: "vid", clipId: "c1" })).status).toBe(400);
    expect(uploadBufferToS3).not.toHaveBeenCalled();
  });
});
