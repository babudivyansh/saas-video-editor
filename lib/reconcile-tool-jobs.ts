import { prisma } from "@/lib/prisma";
import { refundCredits, markGenerationStatus } from "@/lib/credits";
import { logger } from "@/lib/logger";

// Tool/generator jobs (background-remover, face-swap, image/video generators,
// downloaders, vocal-remover, ...) run in a per-route `globalThis` Map that
// does NOT survive a process restart. When the process dies mid-job the Map
// entry is gone, but the Generation row chargeCredits created is left at status
// "pending" and the credits are never refunded — nothing is left to finalize
// it, so the user sees a job stuck "processing" forever and is out the credits.
//
// AutoClip/editor renders are unaffected: they run on durable BullMQ and charge
// via spendCredits (no Generation row), and are reconciled by the stale-clip
// sweep instead.
//
// On boot nothing is processing, so any Generation still "pending" past the
// longest a job could legitimately take is orphaned. Fail it and refund.
// Idempotent: a second run finds it already "failed"/"refunded", and
// refundCredits' restoreSpend is capped at the net amount actually spent, so it
// cannot double-refund. User-cancelled rows (cancelledAt set) are skipped —
// the cancel handler already refunds those.

// Comfortably longer than the longest legitimate in-process job (fal's poll
// deadline is ~12 min), so a still-running job from just before a restart is
// never clawed back mid-flight (it can't be — the Map is gone — but the margin
// also guards against reconciling a request that raced the boot).
export const STALE_TOOL_JOB_MINUTES = 15;

export async function reconcileOrphanedToolJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_TOOL_JOB_MINUTES * 60 * 1000);
  const orphaned = await prisma.generation.findMany({
    where: { status: "pending", cancelledAt: null, createdAt: { lt: cutoff } },
    select: { id: true, userId: true, creditsCost: true },
  });
  if (orphaned.length === 0) return 0;

  let reconciled = 0;
  for (const g of orphaned) {
    try {
      if (g.creditsCost > 0) {
        await refundCredits({ userId: g.userId, amount: g.creditsCost, generationId: g.id });
      }
      await markGenerationStatus(
        g.id,
        "failed",
        "This job was interrupted by a server restart — your credits have been refunded.",
      );
      reconciled++;
    } catch (e) {
      logger.error("reconcile-tool-jobs", `failed to reconcile generation ${g.id}`, e);
    }
  }
  if (reconciled > 0) {
    logger.warn("reconcile-tool-jobs", `refunded + failed ${reconciled} orphaned tool job(s)`);
  }
  return reconciled;
}
