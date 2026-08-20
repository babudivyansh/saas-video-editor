// Global Asset Library — the single funnel every media-input path uses to
// turn an uploaded/imported file into a durable, user-scoped Asset row.
//
// Extracted from app/api/upload/route.ts (the original canonical create
// path) so its dedup/quota/orphan-safety/moderation behavior lives in one
// place instead of being re-implemented per feature. Two entry points:
//
//   adoptUploadedBytes    — bytes are in hand (a multipart form upload, a
//                           decoded base64 payload). Uploads to S3 itself.
//   adoptExistingS3Object — the file is ALREADY in S3 (a URL import, a
//                           reference-image upload, a stock re-host). Creates
//                           an Asset that references the existing key —
//                           never copies the physical object (one media
//                           object -> many feature references).
//
// Both paths: validate MIME, enforce the per-tier single-file cap
// (lib/plans/tiers.ts maxUploadBytesForTier) and the per-tier cumulative
// storage quota (storageLimitBytesForTier), create the Asset, write an
// audit-log row, and enqueue async moderation/thumbnail generation. Callers
// never trust client-supplied size/mimeType/userId — everything here is
// computed or looked up server-side.

import { randomUUID, createHash } from "crypto";
import type { Asset } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import {
  type TierId,
  TIER_LABEL,
  storageLimitBytesForTier,
  maxUploadBytesForTier,
  ALLOWED_UPLOAD_MIME,
  formatBytes,
} from "@/lib/plans/tiers";
import {
  uploadBufferToS3,
  getAssetReadUrl,
  s3KeyToPublicUrl,
  sanitizeS3Key,
  extensionForMime,
  deleteS3Object,
  getS3ObjectSize,
} from "@/utils/s3-upload";
import { enqueueAssetModeration } from "@/lib/asset-moderation";
import { auditAssetAction } from "@/lib/asset-audit";
import { trackOnboardingEvent } from "@/lib/onboarding-analytics";
import { logger } from "@/lib/logger";

// Kept in sync with prisma/schema.prisma's Asset.sourceFeature doc comment.
export type SourceFeature =
  | "upload"
  | "autoclip"
  | "url-import"
  | "editor"
  | "ai-creator"
  | "video-generator"
  | "text-video"
  | "avatar"
  | "stock";

export interface AdoptResult {
  asset: Asset & { url: string };
  url: string;
  key: string;
  duplicate: boolean;
}

export class AssetLimitError extends Error {
  constructor(
    public readonly kind: "file_size" | "storage_quota",
    public readonly limitBytes: number,
    public readonly usedBytes: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "AssetLimitError";
  }
}

// Friendly, upgrade-oriented copy — spec #14 ("This file is 850 MB, but your
// plan supports files up to 500 MB", not a bare "Upload failed").
function fileSizeLimitMessage(fileBytes: number, limitBytes: number, tier: TierId): string {
  return `This file is ${formatBytes(fileBytes)}, but your ${tierDisplayName(tier)} plan supports files up to ${formatBytes(limitBytes)}. Upgrade to upload larger files.`;
}

function storageQuotaMessage(limitBytes: number): string {
  return `Storage limit reached (${formatBytes(limitBytes)} on your plan). Delete files or upgrade to upload more.`;
}

/** HTTP status a route should return for an AssetLimitError — kept here so
 * every call site maps it identically (413 for a too-large file, 402 for a
 * cumulative-quota exhaustion, mirroring the pre-existing /api/upload
 * convention). */
export function assetLimitStatus(kind: AssetLimitError["kind"]): number {
  return kind === "file_size" ? 413 : 402;
}

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetValidationError";
  }
}

export function getAssetKind(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

/**
 * Best-effort image MIME detection from magic bytes, for the rare input path
 * that hands over raw bytes with no Content-Type at all (e.g. a base64 avatar
 * decoded from a JSON body, as opposed to a multipart File that already
 * carries one). Returns null rather than guessing when the format isn't
 * recognized — callers should treat that as "skip adoption", not fall back to
 * a wrong MIME.
 */
export function sniffImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  return null;
}

function tierDisplayName(tier: TierId): string {
  return tier === "free" ? "Free" : TIER_LABEL[tier];
}

function assertAllowedMime(mimeType: string): void {
  if (!ALLOWED_UPLOAD_MIME.test(mimeType)) {
    throw new AssetValidationError("Unsupported file type");
  }
}

export async function assertUnderStorageQuota(userId: string, tier: TierId, incomingBytes: number): Promise<void> {
  const limitBytes = storageLimitBytesForTier(tier);
  const usage = await prisma.asset.aggregate({
    where: { userId, archivedAt: null },
    _sum: { size: true },
  });
  const usedBytes = usage._sum.size ?? 0;
  if (usedBytes + incomingBytes > limitBytes) {
    trackOnboardingEvent(userId, "asset_upload_limit_reached", { kind: "storage_quota", limitBytes, usedBytes });
    throw new AssetLimitError("storage_quota", limitBytes, usedBytes, storageQuotaMessage(limitBytes));
  }
}

export async function assertFileSizeAllowed(userId: string, bytes: number): Promise<TierId> {
  const tier = await getUserTier(userId);
  const maxBytes = maxUploadBytesForTier(tier);
  if (bytes > maxBytes) {
    trackOnboardingEvent(userId, "asset_upload_limit_reached", { kind: "file_size", fileBytes: bytes, limitBytes: maxBytes, tier });
    throw new AssetLimitError("file_size", maxBytes, undefined, fileSizeLimitMessage(bytes, maxBytes, tier));
  }
  return tier;
}

/**
 * Pre-flight check for an upload whose bytes aren't in hand yet — the
 * multipart "create" step only knows the client-declared size up front, with
 * no dedup possible (the full bytes never pass through this server for a
 * multipart upload). Throws AssetLimitError against the SAME per-tier caps
 * every other adopt path uses, so a multipart upload can never end up with a
 * looser limit than a single-shot one.
 */
export async function assertUploadAllowed(userId: string, declaredBytes: number): Promise<TierId> {
  const tier = await assertFileSizeAllowed(userId, declaredBytes);
  await assertUnderStorageQuota(userId, tier, declaredBytes);
  return tier;
}

interface AdoptCommonOpts {
  userId: string;
  name: string;
  mimeType: string;
  sourceFeature: SourceFeature;
  sourceProjectId?: string | null;
  sourceJobId?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Adopt raw bytes the caller already has in memory — the multipart-upload
 * case. Mirrors app/api/upload/route.ts's original handlePOST body exactly
 * (dedup -> file-size cap -> storage quota -> PendingUpload guard -> S3 PUT
 * -> Asset.create -> moderation enqueue -> audit), generalized with a
 * sourceFeature stamp.
 */
export async function adoptUploadedBytes(
  opts: AdoptCommonOpts & { bytes: Buffer },
): Promise<AdoptResult> {
  const { userId, bytes, mimeType, name, sourceFeature, sourceProjectId, sourceJobId, duration, width, height } = opts;
  assertAllowedMime(mimeType);
  const tier = await assertFileSizeAllowed(userId, bytes.length);

  const kind = getAssetKind(mimeType);

  // Duplicate detection — SHA-256 of the actual bytes, computed server-side
  // (never trust a client-supplied hash). Returns the existing asset instead
  // of silently storing (and billing storage for) a second copy.
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.asset.findFirst({ where: { userId, checksum } });
  if (existing) {
    const readUrl = await getAssetReadUrl(existing.s3Key);
    return { asset: { ...existing, url: readUrl }, url: readUrl, key: existing.s3Key, duplicate: true };
  }

  await assertUnderStorageQuota(userId, tier, bytes.length);

  // Extension is derived from the already-validated MIME type, never from a
  // client-supplied filename (see extensionForMime's own doc comment).
  const ext = extensionForMime(mimeType);
  const key = sanitizeS3Key(`uploads/${userId}/${randomUUID()}.${ext}`);

  // Written before the S3 PUT so the cleanup cron (app/api/cron/asset-cleanup)
  // can find and delete this object if the Asset row below never gets created.
  const pending = await prisma.pendingUpload.create({ data: { userId, s3Key: key } });

  let url: string;
  try {
    url = await uploadBufferToS3(bytes, key, mimeType);
  } catch (e) {
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("asset-service", "S3 upload failed", e);
    trackOnboardingEvent(userId, "asset_upload_failed", { sourceFeature, reason: "s3" });
    throw new Error("Upload failed");
  }

  let asset: Asset;
  try {
    asset = await prisma.asset.create({
      data: {
        userId,
        name: name.slice(0, 200),
        s3Key: key,
        url,
        mimeType,
        kind,
        size: bytes.length,
        checksum,
        duration: duration ?? undefined,
        width: width ?? undefined,
        height: height ?? undefined,
        sourceFeature,
        sourceProjectId: sourceProjectId ?? undefined,
        sourceJobId: sourceJobId ?? undefined,
      },
    });
  } catch (e) {
    // DB insert failed after a successful S3 PUT — compensating delete so this
    // doesn't join the set of silently orphaned objects.
    await deleteS3Object(key).catch(() => {});
    await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
    logger.error("asset-service", "Asset row creation failed after a successful S3 upload", e);
    trackOnboardingEvent(userId, "asset_upload_failed", { sourceFeature, reason: "db" });
    throw new Error("Upload failed");
  }

  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
  await auditAssetAction(userId, "upload", asset.id, { name: asset.name, size: asset.size, kind, sourceFeature });
  enqueueAssetModeration({ assetId: asset.id, userId, s3Key: key, mimeType, kind });
  trackOnboardingEvent(userId, "asset_uploaded", { sourceFeature, kind });

  const readUrl = await getAssetReadUrl(key);
  return { asset: { ...asset, url: readUrl }, url: readUrl, key, duplicate: false };
}

/**
 * Adopt a file that is ALREADY sitting in S3 (a URL import, a reference
 * image, a licensed stock re-host) as an Asset — no re-upload, no second
 * physical object. Non-throwing quota/size failures here should generally be
 * treated as non-fatal by the caller (the underlying feature already has the
 * file it needs; only its Assets-library visibility is best-effort).
 */
export async function adoptExistingS3Object(
  opts: AdoptCommonOpts & { s3Key: string; size?: number; skipModeration?: boolean },
): Promise<AdoptResult> {
  const { userId, s3Key, mimeType, name, sourceFeature, sourceProjectId, sourceJobId, duration, width, height, skipModeration } = opts;
  assertAllowedMime(mimeType);

  // One physical object should back at most one Asset per user — if this key
  // was already adopted (e.g. a retried request), return the existing row
  // instead of creating a second reference to the same bytes.
  const existingByKey = await prisma.asset.findFirst({ where: { userId, s3Key } });
  if (existingByKey) {
    const readUrl = await getAssetReadUrl(existingByKey.s3Key);
    return { asset: { ...existingByKey, url: readUrl }, url: readUrl, key: existingByKey.s3Key, duplicate: true };
  }

  const size = opts.size ?? (await getS3ObjectSize(s3Key));

  const tier = await assertFileSizeAllowed(userId, size);
  await assertUnderStorageQuota(userId, tier, size);

  const kind = getAssetKind(mimeType);
  let asset: Asset;
  try {
    asset = await prisma.asset.create({
      data: {
        userId,
        name: name.slice(0, 200),
        s3Key,
        url: s3KeyToPublicUrl(s3Key),
        mimeType,
        kind,
        size,
        duration: duration ?? undefined,
        width: width ?? undefined,
        height: height ?? undefined,
        sourceFeature,
        sourceProjectId: sourceProjectId ?? undefined,
        sourceJobId: sourceJobId ?? undefined,
        ...(skipModeration ? { moderationStatus: "skipped" } : {}),
      },
    });
  } catch (e) {
    logger.error("asset-service", "Asset row creation failed for an existing S3 object", e);
    trackOnboardingEvent(userId, "asset_upload_failed", { sourceFeature, reason: "db" });
    throw new Error("Failed to save asset");
  }

  await auditAssetAction(userId, "upload", asset.id, { name: asset.name, size: asset.size, kind, sourceFeature });
  if (!skipModeration) {
    enqueueAssetModeration({ assetId: asset.id, userId, s3Key, mimeType, kind });
  }
  trackOnboardingEvent(userId, "asset_uploaded", { sourceFeature, kind });

  const readUrl = await getAssetReadUrl(s3Key);
  return { asset: { ...asset, url: readUrl }, url: readUrl, key: s3Key, duplicate: false };
}
