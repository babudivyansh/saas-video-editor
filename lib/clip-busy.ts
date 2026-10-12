import type { CaptionRenderStatus } from "@/lib/captions/types";
import { prisma } from "@/lib/prisma";

// When a clip can't be deleted yet. Deleting the row underneath a worker
// crashes the queue with "record not found" instead of cancelling cleanly,
// and takes the refund with it: a QUEUED clip is often a paid re-render, and
// the cascade also removes in-progress caption renders and dubs, whose
// failure paths refund by reading those very rows. Shared by the web's
// single delete and the app's bulk delete.

/** Caption-render states where a worker or the provider is doing paid work.
 *  ready_to_edit/editing wait on the USER, so they don't block a delete. */
export const CAPTION_JOB_IN_FLIGHT: readonly CaptionRenderStatus[] = [
  "queued", "submitting", "transcribing", "export_queued", "rendering", "downloading", "uploading",
  "needs_reconciliation",
];

/** The clips among `clipIds` with a caption render or a dub still running. */
export async function clipsWithJobsInFlight(clipIds: string[]): Promise<Set<string>> {
  if (clipIds.length === 0) return new Set();
  const [captions, dubs] = await Promise.all([
    prisma.captionRenderJob.findMany({ where: { clipId: { in: clipIds }, status: { in: [...CAPTION_JOB_IN_FLIGHT] } }, select: { clipId: true } }),
    prisma.clipDub.findMany({ where: { clipId: { in: clipIds }, status: { in: ["dubbing", "processing"] } }, select: { clipId: true } }),
  ]);
  return new Set([...captions, ...dubs].flatMap((r) => (r.clipId ? [r.clipId] : [])));
}
