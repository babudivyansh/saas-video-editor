import type { Asset } from "@prisma/client";
import { getAssetReadUrl } from "@/utils/s3-upload";

// One place that decides what an Asset looks like on the wire.
//
// Every asset route used to spread the raw Prisma row straight into the JSON
// response, which shipped s3Key, the SHA-256 checksum, the legacy permanent
// url column and the raw Rekognition moderationLabels to the browser. None of
// it was ever read by a client — it was pure leakage of internal storage
// layout — and s3Key in particular hands an attacker the exact object path
// behind every presigned URL. Serialize through here instead of hand-rolling
// a response shape per route.

/** Folder shape embedded in an asset response. */
export interface SerializedFolder {
  id: string;
  name: string;
  color: string | null;
}

/** Tag shape embedded in an asset response. */
export interface SerializedTag {
  id: string;
  name: string;
}

export interface SerializedAsset {
  id: string;
  name: string;
  /** Freshly minted presigned read URL — never the legacy permanent url column. */
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  kind: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  isFavorite: boolean;
  archivedAt: string | null;
  moderationStatus: string;
  /** processing | ready | failed — orthogonal to moderationStatus. */
  status: string;
  /** Which feature funneled this into the library (provenance, not a permission). */
  sourceFeature: string;
  sourceProjectId: string | null;
  /** Set when this asset IS the rendered output of a clip. */
  sourceClipId: string | null;
  folder: SerializedFolder | null;
  tags: SerializedTag[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Dates arrive as Date from Prisma, but a row that has round-tripped through
 * a JSON cache carries ISO strings instead. Accept both rather than throwing
 * mid-response — a serializer must never be the reason a successful upload
 * returns a 5xx.
 */
function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

/** A Prisma Asset row, optionally with folder/tags joined in. */
export type AssetRow = Asset & {
  folder?: SerializedFolder | null;
  tags?: Array<{ tag: SerializedTag }>;
};

/**
 * Resolve fresh presigned URLs for a batch of assets. Reads always go through
 * s3Key — the url column is only kept for rows created before signed URLs
 * existed and is never trusted.
 */
export async function resolveAssetUrls<T extends { s3Key: string; thumbnailS3Key: string | null }>(
  assets: T[],
): Promise<Array<T & { url: string; thumbnailUrl: string | null }>> {
  return Promise.all(
    assets.map(async (a) => ({
      ...a,
      url: await getAssetReadUrl(a.s3Key),
      thumbnailUrl: a.thumbnailS3Key ? await getAssetReadUrl(a.thumbnailS3Key) : null,
    })),
  );
}

/**
 * Project one asset row onto its public shape. Pass `urls` when they have
 * already been resolved in a batch (avoids re-signing the same key twice).
 */
export function serializeAsset(
  asset: AssetRow,
  urls: { url: string; thumbnailUrl: string | null },
): SerializedAsset {
  return {
    id: asset.id,
    name: asset.name,
    url: urls.url,
    thumbnailUrl: urls.thumbnailUrl,
    mimeType: asset.mimeType,
    kind: asset.kind,
    size: asset.size,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    isFavorite: asset.isFavorite,
    archivedAt: asset.archivedAt ? toIso(asset.archivedAt) : null,
    moderationStatus: asset.moderationStatus,
    status: asset.status,
    sourceFeature: asset.sourceFeature,
    sourceProjectId: asset.sourceProjectId,
    sourceClipId: asset.sourceClipId,
    folder: asset.folder ?? null,
    tags: (asset.tags ?? []).map((t) => t.tag),
    createdAt: toIso(asset.createdAt),
    updatedAt: toIso(asset.updatedAt),
  };
}

/** Resolve URLs and serialize a batch in one step. */
export async function serializeAssets(assets: AssetRow[]): Promise<SerializedAsset[]> {
  const resolved = await resolveAssetUrls(assets);
  return resolved.map((a) => serializeAsset(a, { url: a.url, thumbnailUrl: a.thumbnailUrl }));
}

/** Resolve URLs and serialize a single asset. */
export async function serializeOneAsset(asset: AssetRow): Promise<SerializedAsset> {
  const [one] = await serializeAssets([asset]);
  return one;
}
