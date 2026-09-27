// Starts an AutoClip run: validate → gate → claim → charge → enqueue.
//
// The ONE implementation behind both create routes — the dashboard's
// app/api/generate/auto-clip and the public app/api/v1/clips. They used to be
// two copies "kept in step deliberately", and they had drifted: the public API
// skipped the free tier's monthly allowance entirely (so any free user with an
// API key had unlimited runs), dropped tier priority, and left a previous
// attempt's failureReason on the project. The routes now differ only in how
// the caller authenticates.
//
// Every exit after something was consumed puts it back: the project claim
// and — once charged — the premium-caption credit hold.
//
// Since the Clip Minutes switch (2026-09-26) the run itself is paid in minutes,
// charged in pickJob once the source duration is exact (lib/autoclip-minutes.ts).
// When the duration is already known here, a pre-check refuses a run the user
// can't pay for before anything is claimed or queued. The free tier no longer
// has a "2 runs a month" quota: it gets monthly bonus minutes like everyone
// else gets plan minutes, and its watermark comes from the tier as before. That last one is new:
// the enqueue used to be fire-and-forget, so a Redis outage left the user
// charged with nothing queued and the project on "analyzing" for good.

import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { tierPriority } from "@/lib/plans/tiers";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, type PickPayload } from "@/lib/autoclip-pipeline";
import { precheckRunMinutes } from "@/lib/autoclip-minutes";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES, sanitizeReframeEnum, sanitizeReframePercent } from "@/lib/reframe";
import { resolveCaptionCreateInput } from "@/lib/captions/createPayload";
import { estimateRunCost, bandMaxSeconds } from "@/lib/captions/runEstimate";
import { getCaptionRenderPricing } from "@/lib/captions/pricing";
import { isPremiumTemplateId } from "@/lib/caption-templates";
import { getToolConfig } from "@/lib/tool-config";
import { spendCredits, restoreSpend, logToolGeneration } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { parseAutoClipCreate } from "@/lib/autoclip-create-input";

// createRenderQueue caches by name, so every caller shares one queue/worker.
const pickQueue = createRenderQueue<PickPayload>("auto-clip-pick", pickJob);

export interface StartRunResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, body: Record<string, unknown>): StartRunResult => ({ status, body });

export async function startAutoClipRun(userId: string, rawBody: unknown): Promise<StartRunResult> {
  if (!env.GEMINI_API_KEY) return fail(503, { error: "Auto-clip is not configured on this server" });

  const parsed = parseAutoClipCreate(rawBody);
  if (!parsed.ok) return fail(400, { error: parsed.error });
  const input = parsed.data;
  const { projectId } = input;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { sourceAsset: { select: { duration: true } } },
  });
  if (!project) return fail(404, { error: "Project not found" });
  if (!project.uploadedVideoUrl) return fail(400, { error: "Project has no uploaded video" });

  const tier = await getUserTier(userId);

  // Minutes pre-check — only possible when the source length is already known
  // (an uploaded or library file). Charges nothing; pickJob does. A URL import
  // is checked there instead, after the probe and before any provider spend.
  const knownDuration = project.sourceAsset?.duration ?? null;
  if (knownDuration != null && knownDuration > 0) {
    const pre = await precheckRunMinutes({
      userId, projectId, uploadedVideoUrl: project.uploadedVideoUrl, durationSec: knownDuration,
      allowCreditOverflow: input.allowCreditOverflow,
    });
    if (!pre.ok) {
      return fail(402, {
        error: "insufficient_minutes",
        required: pre.needed,
        balance: pre.available,
        overflowCredits: pre.overflowCredits,
      });
    }
  }

  // Atomic double-submit guard — the transition itself is the check, since two
  // concurrent requests would both pass a stale read.
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, userId, status: { in: ["draft", "failed"] } },
    // Clear any previous attempt's error so a retry doesn't show a stale banner.
    data: { status: "analyzing", failureReason: null },
  });
  if (claimed.count === 0) {
    return fail(409, { error: "Analysis already in progress or already run for this project" });
  }
  // The project is now "analyzing"; leaving it there on a failed start would
  // make the run unretryable.
  const release = async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: "draft" } }).catch(() => {});
  };

  // The admin kill-switch.
  if (!(await getToolConfig("auto-clip")).enabled) {
    await release();
    return fail(503, { error: "Auto Clips are temporarily disabled." });
  }

  const caption = resolveCaptionCreateInput({
    captionStyleIndex: input.captionStyleIndex,
    captionTemplateId: input.captionTemplateId,
  });
  const captionPricing = await getCaptionRenderPricing();
  const estimate = estimateRunCost(
    {
      clipCount: input.clipCount,
      maxDurationSec: bandMaxSeconds(input.minDuration, input.maxDuration),
      premiumCaptions: caption.templateId ? isPremiumTemplateId(caption.templateId) : false,
      sourceDurationSec: knownDuration,
    },
    captionPricing,
  );

  // The premium-caption HOLD, in credits (0 for a native caption style). A
  // worst case, returned when the run settles — each caption render charges
  // its own refId. The run itself is paid in minutes, in pickJob.
  const refId = `auto-clip:${projectId}`;
  if (estimate.total > 0) {
    const spend = await spendCredits({ userId, amount: estimate.total, reason: "spend:auto-clip", refId });
    if (!spend.ok) {
      await release();
      return fail(402, { error: "insufficient_credits", required: estimate.total, balance: spend.balances.total });
    }
  }

  const payload: PickPayload = {
    projectId,
    minDuration: input.minDuration,
    maxDuration: input.maxDuration,
    clipCount: input.clipCount,
    aspectRatio: input.aspectRatio,
    instructions: input.instructions,
    ...caption,
    reframingPreset: sanitizeReframeEnum(input.reframingPreset, REFRAME_PRESETS) ?? "balanced",
    removeSilence: input.removeSilence,
    silenceThresholdMs: input.silenceThresholdMs,
    removeFillers: input.removeFillers,
    smartAutoReframe: input.smartAutoReframe !== false,
    zoomStrength: sanitizeReframeEnum(input.zoomStrength, ZOOM_STRENGTHS) ?? "medium",
    speakerMode: sanitizeReframeEnum(input.speakerMode, SPEAKER_MODES) ?? "auto",
    smoothness: sanitizeReframePercent(input.smoothness) ?? 50,
    trackingSpeed: sanitizeReframePercent(input.trackingSpeed) ?? 50,
    animatedCaptions: input.animatedCaptions,
    allowCreditOverflow: input.allowCreditOverflow,
  };

  try {
    // A fresh job id per run. BullMQ silently ignores an add whose jobId it
    // still holds (removeOnFail keeps 100), so keying on projectId alone meant
    // retrying a failed project charged again and queued nothing. ("-", not
    // ":" — BullMQ rejects a custom id containing a colon.)
    await pickQueue.enqueue(`${projectId}-${Date.now().toString(36)}`, payload, {
      priority: tierPriority(tier),
      rejectOnFailure: true,
    });
  } catch (e) {
    logger.error("auto-clip", `could not queue run for ${projectId}; refunding`, e);
    await restoreSpend({ userId, refId, reason: "refund:auto-clip-enqueue-failed" }).catch(() => {});
    await release();
    return fail(503, { error: "Couldn't start Auto Clip right now — you haven't been charged. Please try again." });
  }

  // Ledger rows alone never reach the margin dashboards — those aggregate
  // Generation. Logged only once the run is actually queued.
  if (estimate.total > 0) {
    void logToolGeneration({ userId, toolSlug: "auto-clip", creditsCost: estimate.total, generationType: "video", refId });
  }

  return { status: 200, body: { status: "analyzing", projectId } };
}
