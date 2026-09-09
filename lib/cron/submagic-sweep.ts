// Reconciliation for premium caption renders.
//
// Shared by the scheduled cron route (app/api/cron/submagic-sweep) and the
// admin-triggered manual sweep, so the two can never drift — same shape as
// lib/cron/dub-sweep.ts, which this is modelled on.
//
// This is NOT merely a safety net. Two things make it the primary completion
// path rather than a backstop:
//
//   1. Whether Submagic sends webhooks at all is unconfirmed, and the route
//      that receives them is inert until SUBMAGIC_WEBHOOK_TOKEN is set. Until
//      that is verified live, this sweep is the ONLY thing that finishes a
//      render — exactly the situation dub-sweep documents for ClipDub.
//   2. Provider has no list endpoint (GET /v1/projects is a 404 — verified),
//      so reconciliation cannot enumerate their side. It has to walk OUR
//      non-terminal rows and ask about each one by id.
//
// Three passes:
//
//   A. needs_reconciliation — the important one. These are renders where a PAID
//      call failed without telling us whether it took effect. Asking the
//      provider is the only way to find out, and it must happen before anything
//      is allowed to spend again. A row here is NEVER blind-retried and NEVER
//      blind-refunded: refunding a render that is in fact running would give
//      the credits back and still deliver the video.
//   B. in-flight rows — poll and advance through the ordinary sync path.
//   C. stale rows — anything past the timeout is force-failed and refunded,
//      which catches a render the provider itself lost track of and a row
//      abandoned mid-flight by a process kill.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getRendererById } from "@/lib/captions/CaptionRendererFactory";
import { validateTemplateMappings } from "@/lib/captions/templateSync";
import { CAPTION_TEMPLATES } from "@/lib/caption-templates";
import {
  claimAndEnqueueDownload,
  enqueueSync,
  failCaptionRender,
} from "@/lib/caption-render-job";
import type { CaptionRenderStatus } from "@/lib/captions/types";

/** Non-terminal states the sweep polls. */
const IN_FLIGHT: CaptionRenderStatus[] = [
  "queued", "submitting", "transcribing", "ready_to_edit",
  "editing", "export_queued", "rendering", "downloading", "uploading",
];

/**
 * ready_to_edit is excluded from the stale timeout on purpose: the job is
 * WAITING FOR THE USER, and a person taking an hour to edit their captions is
 * not a stuck job. Force-failing those would refund and destroy work in
 * progress.
 */
const STALE_EXEMPT: CaptionRenderStatus[] = ["ready_to_edit", "editing"];

export function staleTimeoutMinutes(): number {
  const n = parseInt(env.SUBMAGIC_STALE_TIMEOUT_MINUTES ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export interface SubmagicSweepResult {
  ok: true;
  checked: number;
  advanced: number;
  reconciled: number;
  failed: number;
  mappingsMissing: number;
  at: string;
}

export async function runSubmagicSweep(): Promise<SubmagicSweepResult> {
  const now = Date.now();
  const staleBefore = new Date(now - staleTimeoutMinutes() * 60_000);

  let advanced = 0;
  let reconciled = 0;
  let failed = 0;

  const jobs = await prisma.captionRenderJob.findMany({
    where: { status: { in: [...IN_FLIGHT, "needs_reconciliation"] } },
    include: { clip: true },
    orderBy: { updatedAt: "asc" },
    // Bounded so one pass can't take unbounded time or hammer the provider's
    // 1000/hour budget; the next tick picks up whatever is left.
    take: 100,
  });

  for (const job of jobs) {
    try {
      // ── A. Unknown provider state ────────────────────────────────────────
      if (job.status === "needs_reconciliation") {
        if (!job.providerProjectId) {
          // The create never returned an id, so nothing exists on their side to
          // reconcile against and nothing was delivered. Safe to refund.
          await failCaptionRender(job, "UNRESOLVED", "Caption rendering could not be started.");
          failed++;
          continue;
        }
        const renderer = getRendererById(job.provider);
        const state = await renderer.getRender(job.providerProjectId, {
          exportRequested: true,
          current: job.status as CaptionRenderStatus,
        });
        // It DOES exist and is progressing — put it back on the normal path
        // rather than paying for it twice.
        await prisma.captionRenderJob.update({
          where: { id: job.id },
          data: { status: state.status === "failed" ? "rendering" : state.status, failureCode: null, failureMessage: null },
        });
        await enqueueSync(job);
        reconciled++;
        continue;
      }

      // ── C. Stale ─────────────────────────────────────────────────────────
      if (
        !STALE_EXEMPT.includes(job.status as CaptionRenderStatus) &&
        job.updatedAt < staleBefore
      ) {
        logger.warn("cron/submagic-sweep", `job ${job.id} stale in "${job.status}" — failing and refunding`);
        await failCaptionRender(job, "TIMEOUT", "Caption rendering is taking longer than expected.");
        failed++;
        continue;
      }

      // ── B. In flight ─────────────────────────────────────────────────────
      if (!job.providerProjectId) continue; // not submitted yet; the submit queue owns it

      const renderer = getRendererById(job.provider);
      const state = await renderer.getRender(job.providerProjectId, {
        exportRequested: ["export_queued", "rendering", "downloading", "uploading"].includes(job.status),
        current: job.status as CaptionRenderStatus,
      });

      if (state.status === "failed") {
        await failCaptionRender(job, state.failureCode ?? "PROVIDER_FAILED", "Caption rendering failed.");
        failed++;
        continue;
      }

      if (state.outputUrl) {
        // Same claim helper the webhook uses, so a sweep racing a callback
        // can't double-enqueue the ingest.
        if (await claimAndEnqueueDownload(job)) advanced++;
        continue;
      }

      if (state.status !== job.status) {
        await enqueueSync(job);
        advanced++;
      }
    } catch (err) {
      // One bad row must not abort the pass — the next 99 still need checking.
      logger.error("cron/submagic-sweep", `error reconciling job ${job.id}`, err);
    }
  }

  // Cheap, cached, and catches a mapping that has silently rotted. Logged at
  // error level by validateTemplateMappings itself when something is missing.
  const mapping = await validateTemplateMappings(CAPTION_TEMPLATES).catch(() => null);

  return {
    ok: true,
    checked: jobs.length,
    advanced,
    reconciled,
    failed,
    mappingsMissing: mapping?.missing.length ?? 0,
    at: new Date().toISOString(),
  };
}
