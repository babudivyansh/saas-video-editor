import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { attachmentDisposition } from "@/utils/content-disposition";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { getVideoModel } from "@/lib/models/videoModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, hasEnoughCredits, checkModelAccess } from "@/lib/credits";
import { maxDurationForTier } from "@/lib/plans/tiers";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
  creditCost: number;
  usedVeo3Credits: boolean; // which pool was deducted from — needed for refund
  generationId?: string;
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
  const isVeo3 = modelEntry.integration === "direct-veo3-fast";
  const referenceImageUrl = body.referenceImageUrl ?? null;

  if (modelEntry.imageInput === "required" && !referenceImageUrl) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires a reference image upload` },
      { status: 400 },
    );
  }

  // Tier gate: is this user allowed to select this model at all? Folds Veo3's
  // veo3Enabled/veo3Credits special access into the same mechanism every
  // model uses (see lib/credits.ts's checkModelAccess) — this is orthogonal
  // to *which pool* gets charged below, which stays Veo3-specific logic.
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
  const CREDIT_COST = Math.ceil(modelEntry.creditsPerSecond * duration);

  // Which pool to draw from is unchanged from before: prefer veo3Credits if
  // it covers the (now duration-scaled) cost, else the regular credits pool.
  // Only Veo3 may ever draw from the restricted veo3Credits pool.
  const useVeo3Credits = isVeo3 && (await hasEnoughCredits(auth.userId, CREDIT_COST, "veo3"));

  const falModelId = modelEntry.falEndpoint;
  const aspectRatio = body.aspectRatio ?? "16:9";

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    pool: useVeo3Credits ? "veo3" : "standard",
    toolSlug: "video-generator",
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
    const poolLabel = useVeo3Credits ? "Veo3 credits" : "credits";
    return NextResponse.json({ error: `Insufficient ${poolLabel} (need ${CREDIT_COST})` }, { status: 402 });
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
    usedVeo3Credits: useVeo3Credits,
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

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 10000);

      let videoUrl: string;
      try {
        const raw = await falPollUntilDone(falModelId, requestId);
        videoUrl = extractResultUrl(raw, resultPath);
      } finally {
        clearInterval(progressTimer);
      }

      job.progress = 92;

      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error("Failed to download video from fal.ai");
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);

      job.progress = 100;
      job.status = "done";
      if (job.generationId) void markGenerationStatus(job.generationId, "completed");
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Video generation failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({
            userId: job.userId,
            amount: job.creditCost,
            pool: job.usedVeo3Credits ? "veo3" : "standard",
          });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:video-generator" });

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const download = req.nextUrl.searchParams.get("download");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (download) {
    if (job.status !== "done") return NextResponse.json({ error: "Not ready" }, { status: 409 });
    const buffer = fs.readFileSync(job.outputPath);
    try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
    jobs.delete(jobId);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": attachmentDisposition(job.downloadName),
        "Content-Length": String(buffer.length),
      },
    });
  }

  return NextResponse.json({
    progress: Math.round(job.progress),
    status: job.status,
    error: job.error,
  });
}
