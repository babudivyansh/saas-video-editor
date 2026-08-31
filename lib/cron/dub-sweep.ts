// Shared by the scheduled cron route (app/api/cron/dub-sweep) and the
// admin-triggered manual sweep (app/api/admin/ops/run-dub-sweep) — one
// implementation so the two never drift apart. Mirrors
// lib/cron/stale-clip-sweep.ts's shape.
//
// Until ElevenLabs' dub-completion webhook is confirmed to exist and is
// registered (see app/api/webhooks/elevenlabs/route.ts's doc comment), this
// sweep IS the primary way a ClipDub ever finishes, not just a safety net —
// hence the tight 2-minute cadence recommended in SETUP.md, versus
// stale-clip-sweep's 15.
//
// Two-step pass over every ClipDub still in flight (status "dubbing" or
// "processing", which covers a "processing" row abandoned mid-finish by a
// crash — the atomic claim in claimAndEnqueueFinish never reverts on a
// process kill, only on the explicit "called before ElevenLabs says dubbed"
// branch inside finishDubJob itself):
//
//  1. Poll ElevenLabs directly for each row's status. "dubbed" -> claim +
//     enqueue finishDubJob via the same claimAndEnqueueFinish both the
//     webhook route and this sweep share, so a redelivered webhook racing a
//     sweep pass can't double-enqueue. "failed" -> refund + mark failed.
//     Still "dubbing"/"processing" -> leave alone unless stale (step 2).
//
//  2. Anything older than DUB_STALE_TIMEOUT_MINUTES regardless of what
//     ElevenLabs reports (or if the status call itself throws) is force-failed
//     and refunded — catches a dub ElevenLabs itself lost track of, or a
//     "processing" row whose enqueued finishDubJob crashed the process before
//     writing any terminal state.
export const DUB_STALE_TIMEOUT_MINUTES = 25;

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getDubbingStatus } from "@/utils/elevenlabs";
import { restoreSpend } from "@/lib/credits";
import { claimAndEnqueueFinish } from "@/lib/autoclip-dub";

export interface DubSweepResult {
  ok: true;
  checked: number;
  enqueued: number;
  failed: number;
  at: string;
}

export async function runDubSweep(): Promise<DubSweepResult> {
  const inFlight = await prisma.clipDub.findMany({
    where: { status: { in: ["dubbing", "processing"] }, dubbingId: { not: null } },
    include: { clip: { select: { projectId: true } } },
  });

  const cutoff = new Date(Date.now() - DUB_STALE_TIMEOUT_MINUTES * 60 * 1000);
  let enqueued = 0;
  let failed = 0;

  for (const dub of inFlight) {
    try {
      const status = await getDubbingStatus(dub.dubbingId!);
      if (status === "dubbed") {
        if (await claimAndEnqueueFinish(dub)) enqueued++;
        continue;
      }
      if (status === "failed") {
        await failDub(dub);
        failed++;
        continue;
      }
      // still "dubbing" per ElevenLabs — only intervene if stale.
      if (dub.createdAt < cutoff) {
        await failDub(dub);
        failed++;
      }
    } catch (e) {
      logger.error("cron/dub-sweep", `status check failed for ClipDub ${dub.id}`, e);
      if (dub.createdAt < cutoff) {
        await failDub(dub);
        failed++;
      }
    }
  }

  if (enqueued > 0 || failed > 0) {
    logger.warn("cron/dub-sweep", `checked ${inFlight.length}, enqueued ${enqueued}, failed ${failed}`);
  }

  return { ok: true, checked: inFlight.length, enqueued, failed, at: new Date().toISOString() };
}

async function failDub(dub: { id: string; userId: string | null; refId: string | null }): Promise<void> {
  if (dub.userId && dub.refId) {
    await restoreSpend({ userId: dub.userId, refId: dub.refId, reason: "refund:auto-clip-dub-failed" }).catch((e) =>
      logger.error("cron/dub-sweep", `refund failed for ${dub.id}`, e),
    );
  } else {
    logger.error("cron/dub-sweep", `ClipDub ${dub.id} stuck with no userId/refId — cannot refund`);
  }
  await prisma.clipDub.update({ where: { id: dub.id }, data: { status: "failed" } }).catch(() => {});
}
