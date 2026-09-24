// Shared by the scheduled cron route (app/api/cron/stale-clip-sweep) and the
// admin-triggered manual sweep (app/api/admin/ops/run-stale-clip-sweep) — one
// implementation so the two never drift apart. Mirrors
// lib/cron/commission-payout.ts's shape.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// A clip that is actively RENDERING writes progress as ffmpeg runs, so its
// updatedAt keeps moving; 18 minutes of silence means the worker is gone.
export const STALE_CLIP_TIMEOUT_MINUTES = 18;

// A clip that is QUEUED is just waiting its turn — and production's in-process
// queue driver renders one project at a time, so a queue behind a few long
// sources is legitimately hours deep. The single 18-minute rule used to fail
// those waiting clips (and refund them) before they ever started, and the
// render that later reached them found nothing to do. Only a queue that never
// drains — a job lost to a restart — should hit this.
export const STALE_QUEUED_TIMEOUT_MINUTES = 3 * 60;

// Same reasoning for a whole run stuck on "analyzing": pickJob touches the
// project when it starts, and has its own 30-minute watchdog while running, so
// this long means the job was lost (a restart dropped the in-process queue)
// or never started. Nothing reconciled that state before: the run charge and
// the analysis charge were both held, and the create route won't re-claim an
// "analyzing" project, so the user couldn't even retry.
export const STALE_ANALYZING_TIMEOUT_MINUTES = 3 * 60;

// User-facing reason set on a project the reconciler gives up on because its
// render crashed with nothing rendered. Written to Project.failureReason and
// shown in the results grid.
export const RECONCILE_FAILURE_REASON =
  "Rendering was interrupted before it could finish. Any credits for the unfinished clips have been refunded — please try again.";

export const STRANDED_ANALYSIS_REASON =
  "Analysis was interrupted and didn't finish. You haven't been charged — please try again.";

export interface StaleClipSweepResult {
  ok: true;
  swept: number;
  reconciled: number;
  rerendersRefunded: number;
  analyzingFailed: number;
  at: string;
}

/**
 * Reconciliation of Auto Clip jobs a crash or restart left behind:
 *
 *  1. Stale clips → "failed": RENDERING ones silent for
 *     STALE_CLIP_TIMEOUT_MINUTES, QUEUED ones waiting longer than
 *     STALE_QUEUED_TIMEOUT_MINUTES. A stale clip on a project that is NOT
 *     mid-run was a paid re-render, and is refunded like any failed re-render
 *     — the sweep used to fail it and keep the credit.
 *
 *  2. Projects left on "rendering" with no clip still active are finished via
 *     the pipeline's finalizeRun: settle to what was delivered, flip the
 *     status once, notify once. finalizeRun is idempotent, so it is safe for
 *     this and a late renderJob to both reach it.
 *
 *  3. Projects stuck on "analyzing" past STALE_ANALYZING_TIMEOUT_MINUTES are
 *     failed and fully refunded.
 */
export async function runStaleClipSweep(): Promise<StaleClipSweepResult> {
  const now = Date.now();
  const renderingCutoff = new Date(now - STALE_CLIP_TIMEOUT_MINUTES * 60 * 1000);
  const queuedCutoff = new Date(now - STALE_QUEUED_TIMEOUT_MINUTES * 60 * 1000);

  const stale = await prisma.clip.findMany({
    where: {
      OR: [
        { status: "rendering", updatedAt: { lt: renderingCutoff } },
        { status: "queued", updatedAt: { lt: queuedCutoff } },
      ],
    },
    select: { id: true, project: { select: { status: true } } },
  });

  let swept = 0;
  let rerendersRefunded = 0;
  if (stale.length > 0) {
    // Re-assert the stale condition in the write, so a clip that a worker
    // picked up between the read and here is left alone.
    const result = await prisma.clip.updateMany({
      where: {
        id: { in: stale.map((c) => c.id) },
        OR: [
          { status: "rendering", updatedAt: { lt: renderingCutoff } },
          { status: "queued", updatedAt: { lt: queuedCutoff } },
        ],
      },
      data: { status: "failed" },
    });
    swept = result.count;
    logger.warn("cron/stale-clip-sweep", `swept ${swept} stale clip(s)`);

    // A project that isn't mid-run means these were single-clip re-renders.
    const rerenders = stale.filter((c) => c.project.status !== "rendering");
    if (rerenders.length > 0) {
      const { refundFailedRerender } = await import("@/lib/autoclip-rerender");
      for (const c of rerenders) {
        await refundFailedRerender(c.id);
        rerendersRefunded++;
      }
    }
  }

  const reconciled = await reconcileStrandedProjects();
  const analyzingFailed = await failStrandedAnalyses();

  return { ok: true, swept, reconciled, rerendersRefunded, analyzingFailed, at: new Date().toISOString() };
}

/** Step 2 above. Returns how many projects were moved to a terminal state. */
async function reconcileStrandedProjects(): Promise<number> {
  const stranded = await prisma.project.findMany({
    where: {
      status: "rendering",
      // At least one clip, and none of them still queued/rendering.
      clips: { some: {}, none: { status: { in: ["queued", "rendering"] } } },
    },
    select: { id: true, userId: true },
  });
  if (stranded.length === 0) return 0;

  // Lazy-imported: autoclip-pipeline pulls a heavy ffmpeg/reframe module graph.
  const { finalizeRun } = await import("@/lib/autoclip-pipeline");

  let reconciled = 0;
  for (const { id: projectId, userId } of stranded) {
    try {
      await finalizeRun(projectId, userId, RECONCILE_FAILURE_REASON);
      reconciled++;
    } catch (e) {
      logger.error("cron/stale-clip-sweep", `failed to reconcile stranded project ${projectId}`, e);
    }
  }
  if (reconciled > 0) logger.warn("cron/stale-clip-sweep", `reconciled ${reconciled} stranded project(s)`);
  return reconciled;
}

/** Step 3 above. */
async function failStrandedAnalyses(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_ANALYZING_TIMEOUT_MINUTES * 60 * 1000);
  const stuck = await prisma.project.findMany({
    where: { status: "analyzing", updatedAt: { lt: cutoff } },
    select: { id: true, userId: true },
  });
  if (stuck.length === 0) return 0;

  const [{ refundRunCharge, notifyRenderOutcome }, { restoreSpend }, { analysisRefId }] = await Promise.all([
    import("@/lib/autoclip-pipeline"),
    import("@/lib/credits"),
    import("@/lib/autoclip-pricing"),
  ]);

  let failed = 0;
  for (const { id: projectId, userId } of stuck) {
    try {
      // The transition is the claim, so a pick that finally started (and
      // touched updatedAt) in the meantime is never failed underneath itself.
      const moved = await prisma.project.updateMany({
        where: { id: projectId, status: "analyzing", updatedAt: { lt: cutoff } },
        data: { status: "failed", failureReason: STRANDED_ANALYSIS_REASON },
      });
      if (moved.count === 0) continue;
      await refundRunCharge(userId, projectId, "refund:auto-clip-analysis-stranded");
      await restoreSpend({ userId, refId: analysisRefId(projectId), reason: "refund:auto-clip-analysis-stranded" })
        .catch(() => 0);
      await prisma.clip.deleteMany({ where: { projectId, status: "queued" } }).catch(() => {});
      await notifyRenderOutcome(projectId, userId, "failed", { reason: STRANDED_ANALYSIS_REASON });
      failed++;
    } catch (e) {
      logger.error("cron/stale-clip-sweep", `failed to reconcile stuck analysis ${projectId}`, e);
    }
  }
  if (failed > 0) logger.warn("cron/stale-clip-sweep", `failed and refunded ${failed} stranded analysis run(s)`);
  return failed;
}
