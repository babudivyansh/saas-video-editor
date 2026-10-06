import { z } from "zod";
import { AUTOCLIP_LIMITS, type PlanTier } from "./create";

// Assets library. Shapes follow the web's Asset / AssetFolder rows
// (prisma/schema.prisma); limits from lib/plans/tiers.ts and
// lib/asset-cleanup.ts, pinned by lib/mobile-assets-schema.test.ts.

export const assetKindSchema = z.enum(["video", "audio", "image"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** Where an asset came from. The web's sourceFeature, plus the AI tools that save to Assets from Phase 5. */
export const assetSourceSchema = z.enum(["upload", "autoclip", "url-import", "editor", "stock", "image-generator", "voiceover", "enhance-speech", "vocal-remover"]);
export type AssetSource = z.infer<typeof assetSourceSchema>;
export const AI_SOURCES: readonly AssetSource[] = ["image-generator", "voiceover", "enhance-speech", "vocal-remover"];

export const assetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: assetKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
  folderId: z.string().nullable(),
  favorite: z.boolean(),
  /** Soft-deleted ("Archive"); removed for good ARCHIVE_RETENTION_DAYS later. */
  archivedAt: z.string().nullable(),
  source: assetSourceSchema,
  /** AI assets: the model or voice that made it ("Seedream 5.0", "Brian"). */
  madeWith: z.string().nullable(),
  status: z.enum(["processing", "ready", "failed"]),
  createdAt: z.string(),
  /** Signed, short-lived link to the file (the API sends it; the mocks don't). */
  url: z.string().nullable().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetFolderSchema = z.object({ id: z.string(), name: z.string().trim().min(1, "Name the folder").max(60), fileCount: z.number().int().nonnegative() });
export type AssetFolder = z.infer<typeof assetFolderSchema>;

/** Storage per plan, GB (lib/plans/tiers.ts STORAGE_LIMIT_GB). */
export const STORAGE_LIMIT_GB: Record<PlanTier, number> = { free: 0.5, creator: 2, pro: 5, studio: 15 };
export const storageLimitBytes = (plan: PlanTier) => STORAGE_LIMIT_GB[plan] * 1024 ** 3;
/** Biggest single file per plan (same cap as AutoClip uploads). */
export const maxFileBytes = (plan: PlanTier) => AUTOCLIP_LIMITS[plan].maxBytes;
export const ARCHIVE_RETENTION_DAYS = 30;

/** Why a file can't be uploaded, or null. */
export function assetUploadProblem(sizeBytes: number, usedBytes: number, plan: PlanTier): string | null {
  if (sizeBytes > maxFileBytes(plan)) return "That file is bigger than your plan allows for one file";
  if (usedBytes + sizeBytes > storageLimitBytes(plan)) return "Not enough storage left. Archive or delete files, or upgrade.";
  return null;
}

export const ASSET_SORTS = [
  { id: "date", label: "Newest" },
  { id: "name", label: "Name" },
  { id: "size", label: "Largest" },
  { id: "duration", label: "Longest" },
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number]["id"];

export function sortAssets<T extends Asset>(list: T[], sort: AssetSort): T[] {
  const by: Record<AssetSort, (a: T, b: T) => number> = {
    date: (a, b) => b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
    size: (a, b) => b.sizeBytes - a.sizeBytes,
    duration: (a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1),
  };
  return [...list].sort(by[sort]);
}

export const ASSET_FILTERS = [
  { id: "all", label: "All" },
  { id: "video", label: "Videos" },
  { id: "image", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "ai", label: "AI Assets" },
] as const;
export type AssetFilter = (typeof ASSET_FILTERS)[number]["id"];

// ── Mobile API (/api/mobile/v1/assets, /uploads) ───────────────────────────

/** GET /assets?kind=&folderId=(id|none)&favorites=1&archived=1&ai=1&q=&cursor= */
export const assetsPageSchema = z.object({ assets: z.array(assetSchema), nextCursor: z.string().nullable() });
/** GET /assets/storage */
export const assetStorageSchema = z.object({
  usedBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().nonnegative(),
  maxUploadBytes: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
});
export type AssetStorage = z.infer<typeof assetStorageSchema>;

/** PATCH /assets/:id. folderId null = take it out of its folder; restore = un-archive. */
export const assetPatchRequest = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(200).optional(),
    favorite: z.boolean().optional(),
    folderId: z.string().nullable().optional(),
    restore: z.literal(true).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

export const folderNameRequest = z.object({ name: assetFolderSchema.shape.name });
export const foldersResponseSchema = z.object({ folders: z.array(assetFolderSchema) });

/**
 * Uploads go straight to storage in parts: POST /uploads gives presigned PUT
 * URLs, the app PUTs each part and keeps its ETag, then POST /uploads/complete
 * turns the file into an asset (size and quota checked on the real object).
 */
export const uploadStartRequest = z.object({
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
export const uploadPartUrlsSchema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().positive(), url: z.string() })) });
export const uploadStartResponse = uploadPartUrlsSchema.extend({
  key: z.string(),
  uploadId: z.string(),
  /** Every part is this size except the last. */
  partSizeBytes: z.number().int().positive(),
});
export type UploadStart = z.infer<typeof uploadStartResponse>;
/** POST /uploads/part-urls — fresh URLs for parts whose link expired (an hour). */
export const uploadPartUrlsRequest = z.object({ key: z.string(), uploadId: z.string(), partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(500) });
export const uploadCompleteRequest = z.object({
  key: z.string(),
  uploadId: z.string(),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1) })).min(1),
  durationSec: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export const uploadAbortRequest = z.object({ key: z.string(), uploadId: z.string() });
