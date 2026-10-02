import { assetFolderSchema, assetSchema, type Asset, type AssetFolder } from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for /api/mobile/v1/assets until Phase 5.
// Scenarios (core.ts): "assets".

const MB = 1024 * 1024;
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
const a = (p: Partial<Asset> & Pick<Asset, "id" | "name" | "kind" | "sizeBytes">): Asset => ({
  durationSec: null,
  thumbnailUrl: null,
  folderId: null,
  favorite: false,
  archivedAt: null,
  source: "upload",
  madeWith: null,
  status: "ready",
  createdAt: ago(1),
  ...p,
  sizeBytes: Math.round(p.sizeBytes),
});

const INITIAL_ASSETS: Asset[] = [
  a({ id: "a1", name: "Founders Pod · Ep. 42.mp4", kind: "video", sizeBytes: 54 * MB, durationSec: 3520, thumbnailUrl: "asset:podcast-mic", folderId: "f1", favorite: true, createdAt: ago(2) }),
  a({ id: "a2", name: "Intro clip.mp4", kind: "video", sizeBytes: 9.4 * MB, durationSec: 41, thumbnailUrl: "asset:creator-smile", source: "autoclip", createdAt: ago(3) }),
  a({ id: "a3", name: "Leg day.mov", kind: "video", sizeBytes: 22 * MB, durationSec: 134, thumbnailUrl: "asset:gym-lift", folderId: "f2", createdAt: ago(5) }),
  a({ id: "a4", name: "Summit.jpg", kind: "image", sizeBytes: 2.1 * MB, thumbnailUrl: "asset:travel-summit", folderId: "f2", createdAt: ago(8) }),
  a({ id: "a5", name: "Intro sting — neon", kind: "audio", sizeBytes: 0.64 * MB, durationSec: 6, createdAt: ago(9) }),
  a({ id: "a6", name: "Guest portrait.png", kind: "image", sizeBytes: 1.8 * MB, thumbnailUrl: "asset:founder-portrait", folderId: "f3", createdAt: ago(12) }),
  a({ id: "a7", name: "Investors cut.mp4", kind: "video", sizeBytes: 8.8 * MB, durationSec: 44, thumbnailUrl: "asset:creator-golden", source: "editor", createdAt: ago(20) }),
  a({ id: "a8", name: "Hiring teaser.mp4", kind: "video", sizeBytes: 11 * MB, durationSec: 52, thumbnailUrl: "asset:creator-hat", status: "processing", createdAt: ago(0.2) }),
  a({ id: "a9", name: "Founders Pod Ep. 42 — audio", kind: "audio", sizeBytes: 54 * MB, durationSec: 3520, source: "autoclip", folderId: "f1", createdAt: ago(2) }),
  a({ id: "a10", name: "Upbeat drive", kind: "audio", sizeBytes: 4.2 * MB, durationSec: 168, source: "stock", createdAt: ago(30) }),
  // AI results (saved as Assets from Phase 5).
  a({ id: "ai1", name: "A photographer on a misty mountain summit", kind: "image", sizeBytes: 1.4 * MB, thumbnailUrl: "asset:travel-summit", source: "image-generator", madeWith: "Seedream 5.0", createdAt: ago(4) }),
  a({ id: "ai2", name: "Neon DJ decks, close-up", kind: "image", sizeBytes: 1.2 * MB, thumbnailUrl: "asset:dj-neon", source: "image-generator", madeWith: "Flux 2", createdAt: ago(6) }),
  a({ id: "ai3", name: "Film set clapper, golden hour", kind: "image", sizeBytes: 1.3 * MB, thumbnailUrl: "asset:clapper", source: "image-generator", madeWith: "GPT Image 2", createdAt: ago(7) }),
  a({ id: "ai4", name: "Why creators quit", kind: "audio", sizeBytes: 1.1 * MB, durationSec: 32, source: "voiceover", madeWith: "Brian", createdAt: ago(10) }),
  a({ id: "ai5", name: "Launch teaser VO", kind: "audio", sizeBytes: 0.6 * MB, durationSec: 18, source: "voiceover", madeWith: "Sarah", createdAt: ago(14) }),
  a({ id: "ai6", name: "Ep. 42 — speech enhanced", kind: "audio", sizeBytes: 54 * MB, durationSec: 3520, source: "enhance-speech", createdAt: ago(16) }),
  a({ id: "ai7", name: "Ep. 41 — vocals removed", kind: "audio", sizeBytes: 38 * MB, durationSec: 2472, source: "vocal-remover", createdAt: ago(40) }),
  a({ id: "old1", name: "Old b-roll.mp4", kind: "video", sizeBytes: 6 * MB, durationSec: 22, thumbnailUrl: "asset:creator-denim", archivedAt: ago(24 * 3), createdAt: ago(24 * 40) }),
];
const INITIAL_FOLDERS = [
  { id: "f1", name: "Podcast raw" },
  { id: "f2", name: "B-roll" },
  { id: "f3", name: "Brand kit" },
];

let ASSETS = INITIAL_ASSETS;
let FOLDERS = INITIAL_FOLDERS;
let seq = 0;

export function resetAssetMocks() {
  ASSETS = INITIAL_ASSETS;
  FOLDERS = INITIAL_FOLDERS;
}

export async function getAssets(): Promise<Asset[]> {
  const s = await respond("assets");
  return z.array(assetSchema).parse(s === "empty" ? [] : ASSETS);
}

export async function getFolders(): Promise<AssetFolder[]> {
  const s = await respond("assets");
  if (s === "empty") return [];
  return FOLDERS.map((f) => assetFolderSchema.parse({ ...f, fileCount: ASSETS.filter((x) => x.folderId === f.id && !x.archivedAt).length }));
}

export async function createFolder(name: string): Promise<AssetFolder> {
  const parsed = assetFolderSchema.pick({ name: true }).safeParse({ name });
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Name the folder", 400, "name");
  if (FOLDERS.some((f) => f.name.toLowerCase() === parsed.data.name.toLowerCase())) throw new ApiError("You already have a folder with that name.", 409, "name");
  await wait();
  const folder = { id: `f_new${++seq}`, name: parsed.data.name };
  FOLDERS = [...FOLDERS, folder];
  return { ...folder, fileCount: 0 };
}

export async function updateAsset(id: string, patch: Partial<Pick<Asset, "favorite" | "folderId" | "name" | "archivedAt">>) {
  if (patch.name !== undefined && !patch.name.trim()) throw new ApiError("Give the file a name.", 400, "name");
  await wait();
  ASSETS = ASSETS.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

export async function deleteAsset(id: string) {
  await wait();
  ASSETS = ASSETS.filter((x) => x.id !== id);
}

/** A picked file starts uploading (Phase 7 does the real transfer). */
export async function addUpload(file: { name: string; size: number; mimeType: string }) {
  await wait();
  const kind = file.mimeType.startsWith("video") ? "video" : file.mimeType.startsWith("audio") ? "audio" : "image";
  ASSETS = [a({ id: `up${++seq}`, name: file.name, kind, sizeBytes: file.size, status: "processing", createdAt: new Date().toISOString() }), ...ASSETS];
}
