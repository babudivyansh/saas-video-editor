import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { markQuestComplete } from "@/lib/quests";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getImageModel } from "@/lib/models/imageModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress, checkModelAccess } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";

export const maxDuration = 120;

// Result is an S3 URL, not a local file — there's nothing to stream via the
// download=1 path every other job-based tool uses, so outputPath/downloadName
// are unused placeholders and the real result travels in job.meta.imageUrl
// instead (same pattern AI Creator already uses for its trim notice).
interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
  meta?: { imageUrl: string };
}

const g = globalThis as unknown as { __imageGenJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__imageGenJobs ?? (g.__imageGenJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    prompt?: string;
    model?: string;
    ratio?: string;
    negativePrompt?: string;
    seed?: number;
    guidanceScale?: number;
    steps?: number;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

  const modelEntry = getImageModel(body.model);
  const CREDIT_COST = modelEntry.creditCost;

  if (modelEntry.integration === "direct-gemini") {
    if (!env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Image generation is not configured (missing GEMINI_API_KEY)" }, { status: 503 });
    }
  } else if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Image generation is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const access = await checkModelAccess(auth.userId, modelEntry);
  if (!access.allowed) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "image-generator",
    idempotencyKey: body.idempotencyKey,
    log: { modelId: modelEntry.id, generationType: "image", prompt, estimatedCostUsd: modelEntry.costUsd },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Image generation is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const jobId = randomUUID();
  const job: Job = {
    progress: 5,
    status: "processing",
    outputPath: "",
    downloadName: "",
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      let imageUrl: string;

      if (modelEntry.integration === "fal") {
        const bodyValues: Partial<Record<typeof modelEntry.supportedParameters[number], string | number>> = {
          aspectRatio: body.ratio,
          negativePrompt: body.negativePrompt,
          seed: body.seed,
          guidanceScale: body.guidanceScale,
          steps: body.steps,
        };
        const input: Record<string, unknown> = {};
        for (const p of modelEntry.supportedParameters) {
          const key = modelEntry.inputMap[p] ?? p;
          if (p === "prompt") input[key] = prompt;
          else if (bodyValues[p] !== undefined) input[key] = bodyValues[p];
          else if (modelEntry.defaultValues[p] !== undefined) input[key] = modelEntry.defaultValues[p];
        }

        job.progress = 15;
        const requestId = await falSubmit(modelEntry.falEndpoint, input);
        job.progress = 25;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

        const ticker = setInterval(() => {
          if (job.progress < 85) job.progress += 5;
          if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
        }, 3000);
        let raw: unknown;
        try {
          // Must stay safely under this route's maxDuration (120s) — see the
          // identical note in app/api/tools/video-generator/route.ts.
          raw = await falPollUntilDone(modelEntry.falEndpoint, requestId, { deadlineMs: 90_000 });
        } finally {
          clearInterval(ticker);
        }
        const resultUrl = extractResultUrl(raw, modelEntry.resultPath);

        if ((job.status as string) === "cancelled") return;
        job.progress = 90;

        const dlRes = await fetch(resultUrl);
        if (!dlRes.ok) throw new Error("Failed to download image from fal.ai");
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
        imageUrl = await uploadBufferToS3(buffer, key, "image/png", "generated-image.png");
      } else {
        // gemini-2.5-flash-image occasionally returns 503 "high demand" — retry a
        // few times with a short backoff before giving up and refunding the credit.
        job.progress = 15;
        let geminiRes: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            },
          );
          if (geminiRes.status !== 503) break;
          logger.warn("image-generator", `gemini-2.5-flash-image 503 (attempt ${attempt + 1}/3), retrying...`);
          job.progress = Math.min(70, job.progress + 15);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }

        if ((job.status as string) === "cancelled") return;

        if (!geminiRes || !geminiRes.ok) {
          const err = geminiRes ? await geminiRes.text() : "no response";
          logger.error("image-generator", `gemini-2.5-flash-image error ${geminiRes?.status}`, err);
          const msg = geminiRes?.status === 503
            ? "Image service is busy right now. Please try again in a moment."
            : "Image generation failed. Please try again.";
          throw new Error(msg);
        }

        job.progress = 75;
        const json = (await geminiRes.json()) as {
          candidates?: { content: { parts: { inlineData?: { data: string; mimeType: string } }[] } }[];
        };
        const b64 = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!b64) throw new Error("No image returned");

        job.progress = 90;
        const buffer = Buffer.from(b64, "base64");
        const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
        imageUrl = await uploadBufferToS3(buffer, key, "image/png", "generated-image.png");
      }

      if ((job.status as string) === "cancelled") return;

      job.progress = 100;
      job.status = "done";
      job.meta = { imageUrl };
      void markQuestComplete(auth.userId, "picture-this");
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      logger.error("image-generator", "job failed", err);
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Image generation failed. Please try again.";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "image/png", deleteOnDownload: false }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:image-generator:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator:cancel" },
);
