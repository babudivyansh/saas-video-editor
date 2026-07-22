// Shared by the scheduled cron route (app/api/cron/stale-clip-sweep) and the
// admin-triggered manual sweep (app/api/admin/ops/run-stale-clip-sweep) — one
// implementation so the two never drift apart. Mirrors
// lib/cron/commission-payout.ts's shape.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Real rendering can legitimately take several minutes (long source video,
// cold ffmpeg start, slow S3 upload). This needs to be comfortably longer
// than any legitimate render but short enough a genuinely crashed job
// doesn't strand a clip for hours.
export const STALE_CLIP_TIMEOUT_MINUTES = 18;

export interface StaleClipSweepResult {
  ok: true;
  swept: number;
  at: string;
}

/**
 * Flips any Clip stuck at "queued"/"rendering" whose updatedAt hasn't moved
 * in STALE_CLIP_TIMEOUT_MINUTES back to "failed". A caught exception is
 * already handled by rerenderJob/renderJob's own catch blocks — this only
 * catches the crash case nothing else can see. Flipping to "failed" makes
 * the clip re-claimable through the same atomic
 * status: { notIn: ["rendering","queued"] } guard the edit/rerender routes
 * already use — no separate "unstick" code path needed.
 */
export async function runStaleClipSweep(): Promise<StaleClipSweepResult> {
  const cutoff = new Date(Date.now() - STALE_CLIP_TIMEOUT_MINUTES * 60 * 1000);
  const result = await prisma.clip.updateMany({
    where: { status: { in: ["queued", "rendering"] }, updatedAt: { lt: cutoff } },
    data: { status: "failed" },
  });
  if (result.count > 0) {
    logger.warn("cron/stale-clip-sweep", `swept ${result.count} stale clip(s)`, {
      cutoffMinutes: STALE_CLIP_TIMEOUT_MINUTES,
    });
  }
  return { ok: true, swept: result.count, at: new Date().toISOString() };
}
