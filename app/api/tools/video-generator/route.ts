import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { getVideoModel } from "@/lib/models/videoModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, checkModelAccess, updateGenerationProgress } from "@/lib/credits";
import { maxDurationForTier } from "@/lib/plans/tiers";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import { markQuestComplete } from "@/lib/quests";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
}

const g = globalThis as unknown as { __videoGenJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__videoGenJobs ?? (g.__videoGenJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
      jobs.delete(id);
    }
  }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Video generation is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  let body: {
    prompt?: string;
    model?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    fps?: number;
    motion?: string;
    seed?: number;
    referenceImageUrl?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt too long (max 2000 chars)" }, { status: 400 });

  const modelEntry = getVideoModel(body.model);

  // Runtime admin overrides: disable or reprice (credits/second) without a
  // deploy (lib/model-overrides.ts, managed in /admin/models).
  const { getModelOverrides } = await import("@/lib/model-overrides");
  const override = (await getModelOverrides())[modelEntry.id];
  if (override?.enabled === false) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} is temporarily unavailable — try another model.` },
      { status: 503 },
    );
  }

  const isVeo3 = modelEntry.integration === "direct-veo3-fast";
  const referenceImageUrl = body.referenceImageUrl ?? null;

  if (modelEntry.imageInput === "required" && !referenceImageUrl) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires a reference image upload` },
      { status: 400 },
    );
  }

  // Tier gate: is this user allowed to select this model at all?
  const access = await checkModelAccess(auth.userId, modelEntry);
  if (!access.allowed) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  // Duration is billed per-second and clamped to both the provider's real
  // ceiling (model.maxDurationSeconds) and the user's plan-tier ceiling
  // (TIER_MAX_DURATION_SECONDS) — previously non-Veo3 requests were passed
  // through completely uncapped, a real bug: a user could already request an
  // arbitrarily long clip and be charged the same flat price.
  const userTier = await getUserTier(auth.userId);
  const tierCap = maxDurationForTier(userTier);
  const requestedDuration = body.duration ?? (isVeo3 ? 8 : 5);
  const duration = Math.min(
    Math.max(requestedDuration, modelEntry.minDurationSeconds),
    Math.min(modelEntry.maxDurationSeconds, tierCap),
  );
  const CREDIT_COST = Math.ceil((override?.creditCost ?? modelEntry.creditsPerSecond) * duration);

  const falModelId = modelEntry.falEndpoint;
  const aspectRatio = body.aspectRatio ?? "16:9";

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "video-generator",
    idempotencyKey: body.idempotencyKey,
    log: {
      modelId: modelEntry.id,
      generationType: "video",
      prompt,
      estimatedCostUsd: modelEntry.costUsd * duration,
    },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Video generation is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `ai-video-${Date.now()}.mp4`;

  const job: Job = {
    progress: 5,
    status: "processing",
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress = 10;

      let falInput: Record<string, unknown>;
      let resultPath: string[];
      if (isVeo3) {
        // Exactly today's Veo3 input shape/result extraction — unchanged.
        falInput = { prompt, duration, aspect_ratio: aspectRatio };
        if (referenceImageUrl) falInput.image_url = referenceImageUrl;
        resultPath = ["video.url"];
      } else {
        const bodyValues: Partial<Record<typeof modelEntry.supportedParameters[number], string | number>> = {
          duration,
          aspectRatio,
          resolution: body.resolution,
          fps: body.fps,
          motion: body.motion,
          seed: body.seed,
        };
        falInput = {};
        for (const p of modelEntry.supportedParameters) {
          if (p === "imageUpload") continue;
          const key = modelEntry.integration === "fal" ? (modelEntry.inputMap[p] ?? p) : p;
          if (p === "prompt") falInput[key] = prompt;
          else if (bodyValues[p] !== undefined) falInput[key] = bodyValues[p];
          else if (modelEntry.defaultValues[p] !== undefined) falInput[key] = modelEntry.defaultValues[p];
        }
        if (referenceImageUrl) falInput.image_url = referenceImageUrl;
        resultPath = modelEntry.integration === "fal" ? modelEntry.resultPath : ["video.url"];
      }

      const requestId = await falSubmit(falModelId, falInput);
      job.progress = 15;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 10000);

      let videoUrl: string;
      try {
        // Must stay safely under this route's maxDuration (300s) — the default
        // 12-minute deadline in lib/fal.ts vastly exceeds it, which meant the
        // platform would kill the request (and orphan the job, no refund)
        // long before this loop ever gave up on its own.
        const raw = await falPollUntilDone(falModelId, requestId, { deadlineMs: 240_000 });
        videoUrl = extractResultUrl(raw, resultPath);
      } finally {
        clearInterval(progressTimer);
      }

      // Cooperative cancellation checkpoint: a cancel request already
      // refunded credits and marked the job "cancelled" — don't stomp that
      // by finalizing as "done" for a result nobody will collect.
      if ((job.status as string) === "cancelled") return;

      job.progress = 92;

      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error("Failed to download video from fal.ai");
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);

      job.progress = 100;
      job.status = "done";
      void markQuestComplete(auth.userId, "first-video");
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Video generation failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:video-generator" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:video-generator:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:video-generator:cancel" },
);
