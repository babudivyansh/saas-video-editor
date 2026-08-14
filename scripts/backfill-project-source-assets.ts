import "dotenv/config";
import { prisma } from "../lib/prisma";
import { adoptExistingS3Object } from "../lib/asset-service";
import { env } from "../lib/env";

// Global Asset Library — one-shot, re-runnable backfill for pre-existing
// media that predates auto-asset creation: Project.uploadedVideoUrl sources
// that were pulled in via AutoClip's URL import (lib/url-import.ts), which
// stored the video on S3 but never created an Asset row for it. File-uploaded
// sources already have an Asset (checksum dedup at upload time), so this is
// safe to run over every project unconditionally.
//
// Idempotent by construction: adoptExistingS3Object's very first step is a
// (userId, s3Key) existence check that returns the current Asset instead of
// creating a second one — so re-running this script is always a no-op for
// anything it already adopted. It also never copies the physical object,
// only creates a new Asset row referencing the key that's already there.
//
// Usage: tsx scripts/backfill-project-source-assets.ts [--dry-run]

/**
 * Recognizes only our own bucket's virtual-hosted-style S3 URL
 * (https://{bucket}.s3.{region}.amazonaws.com/{key}) — the exact shape
 * lib/url-import.ts's uploadFileToS3 always returns. Anything else (a
 * presigned/CDN read URL, a third-party host) is left alone rather than
 * guessed at.
 */
function extractOwnBucketS3Key(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.startsWith(`${env.AWS_S3_BUCKET}.s3.`) || !u.hostname.endsWith(".amazonaws.com")) {
    return null;
  }
  const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
  return key || null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const projects = await prisma.project.findMany({
    where: { uploadedVideoUrl: { not: null } },
    select: { id: true, userId: true, title: true, uploadedVideoUrl: true },
  });

  let adopted = 0;
  let alreadyAssets = 0;
  let skippedUnparseable = 0;
  let failed = 0;

  for (const project of projects) {
    const key = extractOwnBucketS3Key(project.uploadedVideoUrl!);
    if (!key) {
      skippedUnparseable++;
      continue;
    }

    const existing = await prisma.asset.findFirst({ where: { userId: project.userId, s3Key: key } });
    if (existing) {
      alreadyAssets++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would adopt project ${project.id} (${key}) for user ${project.userId}`);
      adopted++;
      continue;
    }

    try {
      const result = await adoptExistingS3Object({
        userId: project.userId,
        s3Key: key,
        mimeType: "video/mp4",
        name: project.title || "Imported video",
        sourceFeature: "autoclip",
        sourceProjectId: project.id,
      });
      if (result.duplicate) alreadyAssets++;
      else adopted++;
    } catch (e) {
      failed++;
      console.error(`failed to adopt project ${project.id} (${key}):`, e instanceof Error ? e.message : e);
    }
  }

  console.log(
    `Done${dryRun ? " (dry run)" : ""}: ${adopted} adopted, ${alreadyAssets} already had an Asset, ` +
    `${skippedUnparseable} skipped (not our bucket / unparseable URL), ${failed} failed, ${projects.length} projects scanned.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
