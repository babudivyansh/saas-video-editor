import { userMessage, rawErrorText, UserFacingError } from "@/lib/user-facing-error";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { markQuestComplete } from "@/lib/quests";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getImageModel, resolveImageAspectRatio, providerAspectRatio } from "@/lib/models/imageModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress, checkModelAccess } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import { saveToolResult } from "@/lib/tool-results";

export const maxDuration = 120;

const MAX_PROMPT_CHARS = 2000;

function clampNum(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}
function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = clampNum(v, min, max);
  return n === undefined ? undefined : Math.round(n);
}

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
  // Uncapped, the whole prompt was stored on Generation.prompt and sent to the
  // provider.
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Keep the prompt under ${MAX_PROMPT_CHARS} characters.` }, { status: 400 });
  }

  const modelEntry = getImageModel(body.model);

  // Runtime admin overrides: a model can be disabled or repriced without a
  // deploy (lib/model-overrides.ts, managed in /admin/models).
  const { getModelOverrides } = await import("@/lib/model-overrides");
  const override = (await getModelOverrides())[modelEntry.id];
  if (override?.enabled === false) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} is temporarily unavailable — try another model.` },
      { status: 503 },
    );
  }
  const CREDIT_COST = override?.creditCost ?? modelEntry.creditCost;
  // Only a ratio this model accepts reaches the provider; anything else (a
  // stale client, another model's ratio) falls back to the model's default.
  const aspectRatio = resolveImageAspectRatio(modelEntry, body.ratio);

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
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) return replayed;
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
          aspectRatio: aspectRatio ? providerAspectRatio(modelEntry, aspectRatio) : undefined,
          // Clamped to sane ranges: these went to fal exactly as sent, and
          // a large step count raises the provider's cost and latency.
          negativePrompt: typeof body.negativePrompt === "string" ? body.negativePrompt.slice(0, MAX_PROMPT_CHARS) : undefined,
          seed: clampInt(body.seed, 0, 2 ** 32 - 1),
          guidanceScale: clampNum(body.guidanceScale, 0, 20),
          steps: clampInt(body.steps, 1, 50),
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
          // Runs after the response was sent, so maxDuration doesn't bound it;
          // a 90s deadline failed (and refunded) jobs fal still billed for.
          raw = await falPollUntilDone(modelEntry.falEndpoint, requestId, { deadlineMs: 5 * 60_000 });
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
            // Key in a header, not the URL — URLs end up in proxy and APM logs.
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY ?? "" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                ...(aspectRatio ? { generationConfig: { imageConfig: { aspectRatio } } } : {}),
              }),
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
            : "Image generation failed. Your credits were refunded — please try again.";
          throw new UserFacingError(msg);
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

      // Kept on the Generation and in the user's Assets (lib/tool-results.ts).
      await saveToolResult({
        userId: auth.userId,
        generationId: job.generationId,
        toolSlug: "image-generator",
        source: { s3Url: imageUrl },
        mimeType: "image/png",
        name: `${prompt.slice(0, 60).replace(/[^\w\s-]/g, "").trim() || "generated image"}.png`,
        meta: { model: modelEntry.id },
      });

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
      job.error = userMessage(err, "Image generation failed. Your credits were refunded — please try again.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch { /* swallow */ }
      }
    }
  })();

  // generationId: the durable record a client can read after a restart.
  return NextResponse.json({ jobId, generationId: charge.generationId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "image/png", deleteOnDownload: false }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:image-generator:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator:cancel" },
);
