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
