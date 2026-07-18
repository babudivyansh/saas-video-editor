import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteS3Object, abortMultipartUpload } from "@/utils/s3-upload";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Scheduled entrypoint for an external scheduler (cron-job.org, Vercel Cron,
// GitHub Actions, etc.) — same shared-secret pattern as
// app/api/cron/social-refresh. Closes the audit finding that no job existed
// to reconcile orphaned S3 objects or hard-delete archived assets.
//
// Jobs (select with ?job=):
//   orphans    (default) — deletes S3 objects whose PendingUpload row never
//                           got cleared (the DB insert after upload failed)
//   retention            — permanently deletes assets archived >30 days ago
//
// Example crontab:
//   */15 * * * *  curl -H "Authorization: Bearer $ASSET_CLEANUP_SECRET" \
//                   https://app.example.com/api/cron/asset-cleanup
//   0 5 * * *     curl -H "Authorization: Bearer $ASSET_CLEANUP_SECRET" \
//                   https://app.example.com/api/cron/asset-cleanup?job=retention

const PENDING_GRACE_MINUTES = 30;
const ARCHIVE_RETENTION_DAYS = 30;

async function sweepOrphanedUploads(): Promise<{ deleted: number; failed: number }> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MINUTES * 60 * 1000);
  const stale = await prisma.pendingUpload.findMany({ where: { createdAt: { lt: cutoff } } });

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
  return { deleted, failed };
}

async function purgeExpiredArchives(): Promise<{ deleted: number; failed: number }> {
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.asset.findMany({ where: { archivedAt: { lt: cutoff } } });

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
  return { deleted, failed };
}

export async function GET(req: NextRequest) {
  const secret = env.ASSET_CLEANUP_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") ?? "orphans";
  if (job === "retention") {
    const result = await purgeExpiredArchives();
    return NextResponse.json({ ok: true, job, ...result });
  }
  if (job !== "orphans") {
    return NextResponse.json({ error: `unknown job "${job}"` }, { status: 400 });
  }
  const result = await sweepOrphanedUploads();
  return NextResponse.json({ ok: true, job, ...result });
}
