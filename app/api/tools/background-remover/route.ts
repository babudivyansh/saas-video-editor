import { userMessage, rawErrorText } from "@/lib/user-facing-error";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { randomUUID } from "crypto";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { saveToolResult } from "@/lib/tool-results";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { falUpload, falSubmit, falPollUntilDone, falCancel, extractResultUrl } from "@/lib/fal";

export const maxDuration = 120;

const CREDIT_COST = 1;
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };
// fal.ai rembg model – removes background from images (PNG/JPG/WEBP)
const FAL_MODEL = "fal-ai/imageutils/rembg";

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  inputPath: string;
  createdAt: number;
}

const g = globalThis as unknown as { __bgRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__bgRemoverJobs ?? (g.__bgRemoverJobs = new Map());

// Runs on every POST and poll, so finished jobs' temp files don't sit on disk
// until someone starts another job.
function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}

// POST – start a job
async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Background remover not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const policy = await resolveUploadPolicy(auth.userId, "background-remover");
  const formData = await readUploadForm(req, policy);
  if (formData instanceof NextResponse) return formData;

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, WEBP, GIF images are supported" }, { status: 400 });
  }

  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "background-remover",
    idempotencyKey,
    log: { generationType: "image" },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) return replayed;
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Background remover is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits (need 1)" }, { status: 402 });
  }

  const jobId = randomUUID();
  // From the allow-listed MIME type, never the user's filename.
  const ext = IMAGE_EXT[file.type] ?? "png";
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${ext}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.png`);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const downloadName = `${baseName}-no-bg.png`;

  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

  const job: Job = {
    progress: 5,
    status: "processing",
    inputPath,
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  // Run async
  (async () => {
    try {
      job.progress = 15;
      const fileBuffer = fs.readFileSync(inputPath);
      const falUrl = await falUpload(fileBuffer, file.type);
      if ((job.status as string) === "cancelled") return;
      job.progress = 30;

      const request = await falSubmit(FAL_MODEL, { image_url: falUrl });
      const abort = new AbortController();
      job.onCancel = () => { abort.abort(); return falCancel(request); };
      if ((job.status as string) === "cancelled") { await job.onCancel(); return; }
      job.progress = 40;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      // Tick progress while waiting
      const ticker = setInterval(() => {
        if (job.progress < 85) job.progress += 5;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 3000);

      let resultUrl: string;
      try {
        // Runs after the POST returned, so maxDuration doesn't bound it; a
        // restart mid-job is covered by reconcileOrphanedToolJobs (15 min).
        const raw = await falPollUntilDone(request, { deadlineMs: 5 * 60_000, pollIntervalMs: 2000, signal: abort.signal });
        resultUrl = extractResultUrl(raw, ["image.url"]);
      } finally {
        clearInterval(ticker);
      }

      if ((job.status as string) === "cancelled") return;
      // From here on the result is the user's: a cancel is refused, so it
      // can't refund a cut-out that is then delivered anyway.
      job.finalizing = true;
      job.progress = 90;

      const dlRes = await fetch(resultUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
      if (!dlRes.ok) throw new Error("Failed to download result");
      const buf = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, buf);
      // The local file serves the web's download; this keeps the result past a
      // restart, on the Generation and in the user's Assets.
      await saveToolResult({ userId: auth.userId, generationId: job.generationId, toolSlug: "background-remover", source: { buffer: buf }, mimeType: "image/png", name: downloadName });

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      logger.error("background-remover", "job failed", err);
      job.error = userMessage(err, "We couldn't remove the background from this image. Your credit was refunded — please try again.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch (e) { logger.error("background-remover", "refund failed", e); }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
  })();

  void markQuestComplete(auth.userId, "explore-toolbox");
  // generationId: the durable record a client can read after a restart.
  return NextResponse.json({ jobId, generationId: charge.generationId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:background-remover" });

const statusHandler = createJobStatusHandler(jobs, { contentType: "image/png", deleteOnDownload: false });

export const GET = withRateLimit(
  (req: NextRequest) => { sweep(); return statusHandler(req); },
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:background-remover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:background-remover:cancel" },
);
