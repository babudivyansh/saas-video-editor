import { prisma } from "@/lib/prisma";

// When a clip can't be deleted yet. Deleting the row underneath a worker
// crashes the queue with "record not found" instead of cancelling cleanly,
// and takes the refund with it: a QUEUED clip is often a paid re-render, and
// the cascade also removes in-progress dubs, whose failure path refunds by
// reading those very rows. Shared by the web's single delete and the app's
// bulk delete.

/** The clips among `clipIds` with a dub still running. */
export async function clipsWithJobsInFlight(clipIds: string[]): Promise<Set<string>> {
  if (clipIds.length === 0) return new Set();
  const dubs = await prisma.clipDub.findMany({
    where: { clipId: { in: clipIds }, status: { in: ["dubbing", "processing"] } },
    select: { clipId: true },
  });
  return new Set(dubs.flatMap((r) => (r.clipId ? [r.clipId] : [])));
}
