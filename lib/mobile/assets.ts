import type { Prisma } from "@prisma/client";
import { AI_SOURCES, type Asset, type AssetKind, type AssetSource } from "@clipiro/shared";
import { serializeAssets, type SerializedAsset } from "@/lib/asset-serialize";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { prisma } from "@/lib/prisma";

// The Assets tab's reads for /api/mobile/v1/assets: the web's own asset rows,
// serialized by the same lib/asset-serialize.ts (signed URLs and thumbnails),
// then put in the app's shape.

const PAGE = 50;
const SOURCES: readonly AssetSource[] = ["upload", "autoclip", "url-import", "editor", "stock", "image-generator", "voiceover", "enhance-speech", "vocal-remover"];
export const UPLOAD_PART_BYTES = 10 * 1024 * 1024; // the web uploader's part size

/** Web Asset.sourceFeature → the app's; anything else (avatar, legacy video tools) shows as an upload. */
export const assetSource = (feature: string): AssetSource => (SOURCES.includes(feature as AssetSource) ? (feature as AssetSource) : "upload");

const kindOf = (k: string): AssetKind => (k === "audio" || k === "image" ? k : "video");
const statusOf = (s: string): Asset["status"] => (s === "ready" || s === "failed" ? s : "processing");

/** Model names for AI assets, from the Generation each one came from. */
async function madeWithFor(rows: { sourceJobId: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.sourceJobId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const gens = await prisma.generation.findMany({ where: { id: { in: ids } }, select: { id: true, modelId: true } });
  const names = new Map(IMAGE_MODELS.map((m) => [m.id, m.displayName]));
  return new Map(gens.flatMap((g) => (g.modelId ? [[g.id, names.get(g.modelId) ?? g.modelId] as [string, string]] : [])));
}

export function toMobileAsset(a: SerializedAsset, madeWith: string | null): Asset {
  return {
    id: a.id,
    name: a.name,
    kind: kindOf(a.kind),
    sizeBytes: a.size,
    durationSec: a.duration ?? null,
    thumbnailUrl: a.thumbnailUrl,
    folderId: a.folder?.id ?? null,
    favorite: a.isFavorite,
    archivedAt: a.archivedAt,
    source: assetSource(a.sourceFeature),
    madeWith,
    status: statusOf(a.status),
    createdAt: a.createdAt,
    url: a.url ?? null,
  };
}

const include = {
  folder: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.AssetInclude;

async function serialize(rows: Prisma.AssetGetPayload<{ include: typeof include }>[]): Promise<Asset[]> {
  const [serialized, madeWith] = await Promise.all([serializeAssets(rows), madeWithFor(rows)]);
  return serialized.map((s, i) => toMobileAsset(s, rows[i]!.sourceJobId ? (madeWith.get(rows[i]!.sourceJobId!) ?? null) : null));
}

export interface AssetQuery {
  kind: AssetKind | null;
  /** A folder id, or "none" for unfiled. */
  folderId: string | null;
  favorites: boolean;
  archived: boolean;
  ai: boolean;
  q: string;
  cursor: string | null;
}

/** Same filters as the web's GET /api/assets, plus `ai` (the AI Assets tab). Newest first. */
export async function listAssets(userId: string, o: AssetQuery) {
  const rows = await prisma.asset.findMany({
    where: {
      userId,
      archivedAt: o.archived ? { not: null } : null,
      ...(o.kind ? { kind: o.kind } : {}),
      ...(o.q ? { name: { contains: o.q, mode: "insensitive" as const } } : {}),
      ...(o.favorites ? { isFavorite: true } : {}),
      ...(o.folderId === "none" ? { folderId: null } : o.folderId ? { folderId: o.folderId } : {}),
      ...(o.ai ? { sourceFeature: { in: [...AI_SOURCES] } } : {}),
    },
    include,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE + 1,
    ...(o.cursor ? { cursor: { id: o.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, PAGE);
  return { assets: await serialize(page), nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null };
}

export async function getAsset(userId: string, id: string): Promise<Asset | null> {
  const row = await prisma.asset.findFirst({ where: { id, userId }, include });
  return row ? (await serialize([row]))[0]! : null;
}

export async function listFolders(userId: string) {
  const folders = await prisma.assetFolder.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    // Archived files aren't in a folder's count: they're out of the library.
    include: { _count: { select: { assets: { where: { archivedAt: null } } } } },
  });
  return { folders: folders.map((f) => ({ id: f.id, name: f.name, fileCount: f._count.assets })) };
}
