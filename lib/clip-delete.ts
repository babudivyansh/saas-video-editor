import { prisma } from "@/lib/prisma";
import { parseS3Url } from "@/lib/s3-url";
import { deleteS3Object } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

// One clip's delete, shared by the owner's DELETE /api/projects/:id/clips/:clipId
// and the admin content review's "Remove".

/** Why a clip can't be deleted right now, or null when it can. */
export async function clipDeleteBlocker(clip: { id: string; status: string }): Promise<string | null> {
  // Deleting the row underneath a worker crashes the queue with "record not
  // found" rather than cancelling cleanly — and, worse, it takes the refund
  // with it: a QUEUED clip is often a paid re-render, and the cascade also
  // removes in-progress dubs, whose failure path refunds by reading those very
  // rows. So "queued" counts as busy too, as does a running dub.
  if (clip.status === "rendering" || clip.status === "queued") {
    return "This clip is still rendering. Wait for it to finish, then delete it.";
  }
  const activeDub = await prisma.clipDub.count({ where: { clipId: clip.id, status: { in: ["dubbing", "processing"] } } });
  if (activeDub > 0) return "This clip is still being dubbed. Wait for it to finish, then delete it.";
  return null;
}

/** Deletes the clip row, then its render + thumbnail objects unless the owner's library still uses them. */
export async function deleteClipAndMedia(
  clip: { id: string; videoUrl: string | null; thumbnailUrl: string | null },
  ownerId: string,
): Promise<void> {
  // The rendered mp4 may since have been adopted into the asset library. If it
  // has, the Asset owns those bytes now and its own delete/retention flow is
  // responsible for them — removing the object here would leave the user with
  // a library entry pointing at nothing. Only clean up storage that nothing
  // else references.
  const objectKeys = [clip.videoUrl, clip.thumbnailUrl]
    .map((url) => (url ? parseS3Url(url)?.key ?? null : null))
    .filter((k): k is string => k !== null);

  const referenced = objectKeys.length
    ? await prisma.asset.findMany({ where: { userId: ownerId, s3Key: { in: objectKeys } }, select: { s3Key: true } })
    : [];
  const referencedKeys = new Set(referenced.map((a) => a.s3Key));

  await prisma.clip.delete({ where: { id: clip.id } });

  // After the row is gone — an orphaned object is recoverable by the cleanup
  // cron, whereas a deleted object with a live row is a broken clip.
  for (const key of objectKeys) {
    if (referencedKeys.has(key)) continue;
    await deleteS3Object(key).catch((e) => {
      logger.warn("clips", "clip object cleanup failed", { key, reason: (e as Error).message });
    });
  }
}
