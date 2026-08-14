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

// User-facing reason set on a project the reconciler gives up on because its
// render crashed with nothing rendered. Written to Project.failureReason and
// shown in the results grid.
export const RECONCILE_FAILURE_REASON =
  "Rendering was interrupted before it could finish. Any credits for the unfinished clips have been refunded — please try again.";

export interface StaleClipSweepResult {
  ok: true;
  swept: number;
  reconciled: number;
  at: string;
}

/**
 * Two-step reconciliation of Auto Clip jobs a crash left behind:
 *
 *  1. Flip any Clip stuck at "queued"/"rendering" whose updatedAt hasn't moved
 *     in STALE_CLIP_TIMEOUT_MINUTES back to "failed" (a caught exception is
 *     already handled by rerenderJob/renderJob's own catch blocks — this only
 *     catches the crash case nothing else can see). Flipping to "failed" makes
 *     the clip re-claimable through the same atomic
 *     status: { notIn: ["rendering","queued"] } guard the edit/rerender routes
 *     already use.
 *
 *  2. Reconcile any Project left stuck at "rendering" with NO clip still
 *     active. renderJob sets the project to completed/failed itself, but a hard
 *     process crash (SIGKILL/OOM) bypasses that final write and left the
 *     project spinning "rendering" forever in the UI (the clips poll returns
 *     project.status verbatim). A LIVE render always keeps at least one clip in
 *     "queued"/"rendering", so a "rendering" project with zero active clips is
 *     either genuinely finished (renderJob is a few statements from writing the
 *     same terminal state — reconciling to it first is harmless) or stranded.
 *     Runs AFTER step 1 so a crashed render's stuck clips are already terminal.
 *     Credits are refunded via the pipeline's refundCredits, whose restoreSpend
 *     is capped at the net amount actually spent on this project, so it cannot
 *     double-refund even if renderJob's own refund also ran.
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

  const reconciled = await reconcileStrandedProjects();

  return { ok: true, swept: result.count, reconciled, at: new Date().toISOString() };
}

/** Step 2 above. Returns how many projects were moved to a terminal state. */
async function reconcileStrandedProjects(): Promise<number> {
  const stranded = await prisma.project.findMany({
    where: {
      status: "rendering",
      // At least one clip, and none of them still queued/rendering.
      clips: { some: {}, none: { status: { in: ["queued", "rendering"] } } },
    },
    select: { id: true },
  });
  if (stranded.length === 0) return 0;

  // Lazy-imported: autoclip-pipeline pulls a heavy ffmpeg/reframe module graph,
  // and only the (rare) stranded-project path needs its pricing/refund helpers.
  // Also sidesteps any import cycle with that module. Same pattern the pipeline
  // itself uses for getUserTier etc.
  const { getAutoClipPricing, computeCreditCost, refundCredits } = await import("@/lib/autoclip-pipeline");

  let reconciled = 0;
  for (const { id: projectId } of stranded) {
    try {
      const clips = await prisma.clip.findMany({
        where: { projectId },
        select: { status: true, videoUrl: true, score: true, durationSec: true },
      });
      if (clips.length === 0) continue; // guarded by `some: {}`, but stay defensive

      const ready = clips.filter((c) => c.status === "ready" && c.videoUrl);
      const totalDurationSec = clips.reduce((s, c) => s + c.durationSec, 0);
      const pricing = await getAutoClipPricing();
      const charged = computeCreditCost(clips.length, totalDurationSec, pricing);

      if (ready.length > 0) {
        const best = ready.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
        await prisma.project.update({
          where: { id: projectId },
          data: { status: "completed", videoUrl: best.videoUrl },
        });
        // Proportional refund for the clips that never rendered — the same
        // formula renderJob's partial-failure path uses.
        const failedCount = clips.length - ready.length;
        if (failedCount > 0) {
          await refundCredits(projectId, Math.round(charged * (failedCount / clips.length)));
        }
      } else {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: "failed", failureReason: RECONCILE_FAILURE_REASON },
        });
        // Nothing rendered — refund the whole confirm charge (restoreSpend caps
        // at net-spent, so this is safe even if a partial refund already ran).
        await refundCredits(projectId, charged);
      }
      reconciled++;
    } catch (e) {
      logger.error("cron/stale-clip-sweep", `failed to reconcile stranded project ${projectId}`, e);
    }
  }

  if (reconciled > 0) {
    logger.warn("cron/stale-clip-sweep", `reconciled ${reconciled} stranded project(s)`);
  }
  return reconciled;
}
