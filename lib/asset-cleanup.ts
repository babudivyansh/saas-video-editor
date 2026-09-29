import { prisma } from "@/lib/prisma";
import { deleteS3Object, abortMultipartUpload } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

// The two storage sweeps behind /api/cron/asset-cleanup, shared with the admin
// Content & Storage page (which previews them with dryRun before running).
//
//   orphans   — S3 objects whose PendingUpload row never got cleared (the DB
//               insert after the upload failed)
//   retention — assets archived more than ARCHIVE_RETENTION_DAYS ago

export const PENDING_GRACE_MINUTES = 30;
export const ARCHIVE_RETENTION_DAYS = 30;

export interface SweepResult {
  dryRun: boolean;
  /** Rows that matched (would be / were cleaned). */
  matched: number;
  deleted: number;
  failed: number;
  /** Bytes that would be / were freed, where the row records a size. */
  bytes: number;
  sample: Array<{ id: string; key: string; createdAt: string }>;
}

const SAMPLE = 10;

export async function sweepOrphanedUploads({ dryRun = false } = {}): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MINUTES * 60 * 1000);
  const stale = await prisma.pendingUpload.findMany({ where: { createdAt: { lt: cutoff } } });
  const sample = stale.slice(0, SAMPLE).map((r) => ({ id: r.id, key: r.s3Key, createdAt: r.createdAt.toISOString() }));
  if (dryRun) return { dryRun, matched: stale.length, deleted: 0, failed: 0, bytes: 0, sample };

  let deleted = 0;
  let failed = 0;
  for (const row of stale) {
    try {
      if (row.multipartUploadId) {
        await abortMultipartUpload(row.s3Key, row.multipartUploadId);
      } else {
        await deleteS3Object(row.s3Key);
      }
      await prisma.pendingUpload.delete({ where: { id: row.id } });
      deleted++;
    } catch (e) {
      failed++;
      logger.warn("asset-cleanup", `failed to clean up orphaned upload ${row.s3Key}`, { reason: (e as Error).message });
    }
  }
  return { dryRun, matched: stale.length, deleted, failed, bytes: 0, sample };
}

export async function purgeExpiredArchives({ dryRun = false } = {}): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.asset.findMany({ where: { archivedAt: { lt: cutoff } } });
  const bytes = expired.reduce((s, a) => s + (a.size ?? 0), 0);
  const sample = expired.slice(0, SAMPLE).map((a) => ({ id: a.id, key: a.name, createdAt: a.createdAt.toISOString() }));
  if (dryRun) return { dryRun, matched: expired.length, deleted: 0, failed: 0, bytes, sample };

  let deleted = 0;
  let failed = 0;
  for (const asset of expired) {
    try {
      await deleteS3Object(asset.s3Key);
      if (asset.thumbnailS3Key) await deleteS3Object(asset.thumbnailS3Key).catch(() => {});
      await prisma.asset.delete({ where: { id: asset.id } });
      deleted++;
    } catch (e) {
      failed++;
      logger.warn("asset-cleanup", `failed to purge expired archive ${asset.id}`, { reason: (e as Error).message });
    }
  }
  return { dryRun, matched: expired.length, deleted, failed, bytes, sample };
}
