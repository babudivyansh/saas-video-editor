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
// Every exit after something was consumed puts it back: the free-tier slot,
// the project claim, and — once charged — the credits. That last one is new:
// the enqueue used to be fire-and-forget, so a Redis outage left the user
// charged with nothing queued and the project on "analyzing" for good.

import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { rateLimit, releaseRateLimit } from "@/lib/rate-limit";
import { FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, tierPriority } from "@/lib/plans/tiers";
import { env } from "@/lib/env";
import { createRenderQueue } from "@/lib/render-queue";
import { pickJob, getAutoClipPricing, type PickPayload } from "@/lib/autoclip-pipeline";
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

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return fail(404, { error: "Project not found" });
  if (!project.uploadedVideoUrl) return fail(400, { error: "Project has no uploaded video" });

  // Free tier gets a small watermarked allowance (rolling 30 days) so the core
  // product is tasteable before paying. Consumed first so two concurrent
  // requests can't both slip under it, and handed back on every exit below
  // that doesn't start a run — a double-submit or a 402 is not a used video.
  const tier = await getUserTier(userId);
  const quotaKey = `autoclip-free:${userId}`;
  let quotaTaken = false;
  if (tier === "free") {
    const { allowed } = await rateLimit(quotaKey, FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, 30 * 86400);
    quotaTaken = true;
    if (!allowed) {
      await releaseRateLimit(quotaKey);
      return fail(402, {
        error: "free_limit_reached",
        message: `You've used your ${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} free Auto Clip videos this month. Upgrade for unlimited, watermark-free clips.`,
        upgradeUrl: "/pricing",
      });
    }
  }
  const giveBackQuota = () => (quotaTaken ? releaseRateLimit(quotaKey).catch(() => {}) : Promise.resolve());

  // Atomic double-submit guard — the transition itself is the check, since two
  // concurrent requests would both pass a stale read.
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, userId, status: { in: ["draft", "failed"] } },
    // Clear any previous attempt's error so a retry doesn't show a stale banner.
    data: { status: "analyzing", failureReason: null },
  });
  if (claimed.count === 0) {
    await giveBackQuota();
    return fail(409, { error: "Analysis already in progress or already run for this project" });
  }
  // The project is now "analyzing"; leaving it there on a failed start would
  // make the run unretryable.
  const release = async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: "draft" } }).catch(() => {});
    await giveBackQuota();
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
  const [pricing, captionPricing] = await Promise.all([getAutoClipPricing(), getCaptionRenderPricing()]);
  const estimate = estimateRunCost(
    {
      clipCount: input.clipCount,
      maxDurationSec: bandMaxSeconds(input.minDuration, input.maxDuration),
      premiumCaptions: caption.templateId ? isPremiumTemplateId(caption.templateId) : false,
    },
    pricing,
    captionPricing,
  );

  // Charged here because there is no later confirm step. Deliberately a worst
  // case — settleRunCost() refunds the difference once real durations exist,
  // and pickJob/renderJob refund it all if the run fails.
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
