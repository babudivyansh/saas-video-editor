// S3 cleanup for project and account deletes.
//
// Deleting a Project (or a whole account) removed database rows only: the
// renders, thumbnails and uploads they pointed at stayed in the bucket
// forever, paid for and reachable by nobody. The asset-cleanup cron only ever
// swept PendingUpload rows and archived Assets.
//
// The rule that keeps this safe: a key still referenced by ANY Asset row is
// library media and is never deleted here. AutoClip adopts renders into the
// library and the editor adopts uploads, so "this project made it" does not
// mean "nothing else uses it". Asset deletes already clean up their own
// objects (app/api/assets/[id], bulk, asset-service).

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { s3KeyFromStoredUrl } from "@/lib/source-url";
import { deleteS3Object } from "@/utils/s3-upload";

function keysFrom(urls: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const key = s3KeyFromStoredUrl(url);
    if (key) keys.add(key);
  }
  return [...keys];
}

/** Every S3 key a set of projects' own rows point at (source, final render, clip renders, thumbnails). */
export async function collectProjectMediaKeys(where: { id: string } | { userId: string }): Promise<string[]> {
  const projects = await prisma.project.findMany({
    where,
    select: {
      uploadedVideoUrl: true,
      videoUrl: true,
      clips: { select: { videoUrl: true, thumbnailUrl: true } },
    },
  });
  return keysFrom(
    projects.flatMap((p) => [p.uploadedVideoUrl, p.videoUrl, ...p.clips.flatMap((c) => [c.videoUrl, c.thumbnailUrl])]),
  );
}

/** Asset keys (media + thumbnail) owned by a user — the library side of an account delete. */
export async function collectUserAssetKeys(userId: string): Promise<string[]> {
  const assets = await prisma.asset.findMany({ where: { userId }, select: { s3Key: true, thumbnailS3Key: true } });
  return [...new Set(assets.flatMap((a) => [a.s3Key, a.thumbnailS3Key]).filter((k): k is string => !!k))];
}

/**
 * Deletes the given keys, skipping any that an Asset row still references.
 * Call AFTER the database delete has committed, so a key freed by that delete
 * (the user's own assets, on an account delete) is no longer "referenced".
 * Best-effort: a failure is logged, never thrown — the user's delete already
 * succeeded and must not be reported as failed over storage.
 */
export async function deleteUnreferencedKeys(keys: string[], context: string): Promise<number> {
  if (keys.length === 0) return 0;
  try {
    const stillUsed = await prisma.asset.findMany({
      where: { OR: [{ s3Key: { in: keys } }, { thumbnailS3Key: { in: keys } }] },
      select: { s3Key: true, thumbnailS3Key: true },
    });
    const keep = new Set(stillUsed.flatMap((a) => [a.s3Key, a.thumbnailS3Key]));
    const doomed = keys.filter((k) => !keep.has(k));
    const results = await Promise.allSettled(doomed.map((k) => deleteS3Object(k)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) logger.warn("storage-cleanup", `${context}: ${failed}/${doomed.length} object deletes failed`);
    return doomed.length - failed;
  } catch (e) {
    logger.error("storage-cleanup", `${context}: cleanup failed`, e);
    return 0;
  }
}
