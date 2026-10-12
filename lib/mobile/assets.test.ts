import { beforeEach, describe, expect, it, vi } from "vitest";
import { assetsPageSchema, foldersResponseSchema } from "@clipiro/shared";

const assetFindMany = vi.fn();
const folderFindMany = vi.fn();
const generationFindMany = vi.fn(async () => [{ id: "g1", modelId: "seedream-5.0" }]);
vi.mock("@/lib/prisma", () => ({
  prisma: { asset: { findMany: assetFindMany, findFirst: vi.fn() }, assetFolder: { findMany: folderFindMany }, generation: { findMany: generationFindMany } },
}));
vi.mock("@/lib/asset-serialize", () => ({
  serializeAssets: vi.fn(async (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ ...r, url: `https://signed/${r.id}`, thumbnailUrl: null, folder: r.folderId ? { id: r.folderId } : null, archivedAt: null, createdAt: "2026-10-01T00:00:00.000Z" })),
  ),
}));

const { assetSource, listAssets, listFolders } = await import("./assets");

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  name: "Ep42-master.mp4",
  kind: "video",
  size: 2_400_000_000,
  duration: 2531.6,
  isFavorite: false,
  status: "ready",
  sourceFeature: "upload",
  sourceJobId: null,
  folderId: null,
  ...over,
});
const q = { kind: null, folderId: null, favorites: false, archived: false, ai: false, q: "", cursor: null };

beforeEach(() => vi.clearAllMocks());

describe("assets", () => {
  it("maps the web's rows to the app's shape, naming the model behind AI files", async () => {
    assetFindMany.mockResolvedValue([row(), row({ id: "a2", kind: "image", sourceFeature: "image-generator", sourceJobId: "g1", folderId: "f1", status: "processing" }), row({ id: "a3", sourceFeature: "avatar" })]);
    const page = assetsPageSchema.parse(await listAssets("u1", q));
    expect(page.assets[0]).toMatchObject({ id: "a1", kind: "video", sizeBytes: 2_400_000_000, durationSec: 2531.6, source: "upload", madeWith: null, url: "https://signed/a1" });
    expect(page.assets[1]).toMatchObject({ source: "image-generator", madeWith: "Seedream 5.0", folderId: "f1", status: "processing" });
    expect(page.assets[2]!.source).toBe("upload"); // avatars and legacy sources read as uploads
  });

  it("filters like the web, plus the AI tab, always within the caller's own files", async () => {
    assetFindMany.mockResolvedValue([]);
    await listAssets("u1", { ...q, kind: "audio", folderId: "none", favorites: true, ai: true, q: "ep42" });
    expect(assetFindMany.mock.calls[0]![0].where).toEqual({
      userId: "u1",
      archivedAt: null,
      kind: "audio",
      name: { contains: "ep42", mode: "insensitive" },
      isFavorite: true,
      folderId: null,
      sourceFeature: { in: ["image-generator", "voiceover", "enhance-speech", "vocal-remover"] },
    });
    await listAssets("u1", { ...q, archived: true });
    expect(assetFindMany.mock.calls[1]![0].where).toEqual({ userId: "u1", archivedAt: { not: null } });
  });

  it("pages 50 at a time", async () => {
    assetFindMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => row({ id: `a${i}` })));
    const page = await listAssets("u1", q);
    expect([page.assets.length, page.nextCursor]).toEqual([50, "a49"]);
  });

  it("counts a folder's live files only", async () => {
    folderFindMany.mockResolvedValue([{ id: "f1", name: "Episode masters", _count: { assets: 3 } }]);
    expect(foldersResponseSchema.parse(await listFolders("u1"))).toEqual({ folders: [{ id: "f1", name: "Episode masters", fileCount: 3 }] });
    expect(folderFindMany.mock.calls[0]![0].include._count.select.assets).toEqual({ where: { archivedAt: null } });
  });

  it.each([["upload", "upload"], ["autoclip", "autoclip"], ["voiceover", "voiceover"], ["video-generator", "upload"], ["avatar", "upload"]])("source %s → %s", (web, app) => {
    expect(assetSource(web)).toBe(app);
  });
});
