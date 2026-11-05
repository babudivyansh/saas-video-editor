import { userMessage } from "@/lib/user-facing-error";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { saveToolResult } from "@/lib/tool-results";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress, checkModelAccess } from "@/lib/credits";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { falUpload, falSubmit, falPollUntilDone, falCancel, extractResultUrl } from "@/lib/fal";

export const maxDuration = 120;

const CREDIT_COST = 2;
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const FAL_MODEL = "fal-ai/face-swap";

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  inputPaths: string[];
  createdAt: number;
}

const g = globalThis as unknown as { __faceSwapJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__faceSwapJobs ?? (g.__faceSwapJobs = new Map());

// Runs on every POST and poll, so old temp files don't wait for the next job.
function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [...job.inputPaths, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}

// POST – start job
async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Face swap not configured (missing FAL_KEY)" }, { status: 503 });
  }

  // Pro+ only while the per-run provider cost is unverified (see lib/tool-costs.ts).
  const access = await checkModelAccess(auth.userId, { allowedTiers: ["pro", "studio"] });
  if (!access.allowed) {
    return NextResponse.json(
      { error: `Face Swap requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const policy = await resolveUploadPolicy(auth.userId, "face-swap");
  const formData = await readUploadForm(req, policy, 2);
  if (formData instanceof NextResponse) return formData;

  // Face swapping other people without their permission is the misuse this
  // tool invites, so the person confirms consent on every run (web checkbox,
  // mobile toggle) and the confirmation is recorded on the Generation row.
  if ((formData.get("consent") as string | null) !== "1") {
    return NextResponse.json(
      { error: "Please confirm you have permission to use the faces in both photos." },
      { status: 400 },
    );
  }

  const characterFile = formData.get("characterImage") as File | null;
  const targetFile    = formData.get("targetImage")    as File | null;
  if (!characterFile || !targetFile) {
    return NextResponse.json({ error: "Both characterImage and targetImage are required" }, { status: 400 });
  }

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  for (const f of [characterFile, targetFile]) {
    if (!allowed.includes(f.type)) {
      return NextResponse.json({ error: "Only PNG, JPG, WEBP images are supported" }, { status: 400 });
    }
    try {
      assertWithinUploadPolicy(policy, f.size);
    } catch (e) {
      if (e instanceof UploadPolicyError) {
        return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
      }
      throw e;
    }
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "face-swap",
    idempotencyKey,
    log: { generationType: "image", prompt: "consent: user confirmed permission for both faces" },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) return replayed;
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Face swap is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  const jobId = randomUUID();
  // From the allow-listed MIME types, never the user's filenames.
  const charExt = IMAGE_EXT[characterFile.type] ?? "jpg";
  const targExt = IMAGE_EXT[targetFile.type] ?? "jpg";
  const charPath = path.join(os.tmpdir(), `${jobId}-char.${charExt}`);
  const targPath = path.join(os.tmpdir(), `${jobId}-targ.${targExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.jpg`);

  fs.writeFileSync(charPath, Buffer.from(await characterFile.arrayBuffer()));
  fs.writeFileSync(targPath, Buffer.from(await targetFile.arrayBuffer()));

  const job: Job = {
    progress: 5,
    status: "processing",
    inputPaths: [charPath, targPath],
    outputPath,
    downloadName: "face-swap-result.jpg",
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress = 15;
      const [charUrl, targUrl] = await Promise.all([
        falUpload(fs.readFileSync(charPath), characterFile.type),
        falUpload(fs.readFileSync(targPath), targetFile.type),
      ]);
      if ((job.status as string) === "cancelled") return;
      job.progress = 35;

      const request = await falSubmit(FAL_MODEL, {
        swap_image_url: charUrl, // the face to use (character image)
        base_image_url: targUrl, // the target to swap into
      });
      const abort = new AbortController();
      job.onCancel = () => { abort.abort(); return falCancel(request); };
      if ((job.status as string) === "cancelled") { await job.onCancel(); return; }
      job.progress = 45;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const ticker = setInterval(() => {
        if (job.progress < 85) job.progress += 4;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 3000);

      let resultUrl: string;
      try {
        // Runs after the POST returned, so maxDuration doesn't bound it; a
        // restart mid-job is covered by reconcileOrphanedToolJobs (15 min).
        const raw = await falPollUntilDone(request, { deadlineMs: 5 * 60_000, pollIntervalMs: 3000, signal: abort.signal });
        resultUrl = extractResultUrl(raw, ["image.url", "images.0.url"]);
      } finally { clearInterval(ticker); }

      if ((job.status as string) === "cancelled") return;
      // The result is the user's from here: a cancel would refund it anyway.
      job.finalizing = true;

      job.progress = 90;

      const dlRes = await fetch(resultUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
      if (!dlRes.ok) throw new Error("Failed to download result");
      const swapped = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, swapped);
      // The local file serves the web's download; this keeps the result past a
      // restart, on the Generation and in the user's Assets.
      await saveToolResult({ userId: auth.userId, generationId: job.generationId, toolSlug: "face-swap", source: { buffer: swapped }, mimeType: "image/jpeg", name: `face-swap-${Date.now()}.jpg` });

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      const msg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? (err as NodeJS.ErrnoException).cause : undefined;
      logger.error("face-swap", `job failed: ${msg}`, cause ?? undefined);
      job.status = "error";
      job.error = userMessage(err, "We couldn't swap the faces in these photos. Your credits were refunded — try clearer, front-facing photos.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", msg);
        } catch (e) { logger.error("face-swap", "refund failed", e); }
      }
    } finally {
      for (const p of [charPath, targPath]) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }
  })();

  void markQuestComplete(auth.userId, "explore-toolbox");
  // generationId: the durable record a client can read after a restart.
  return NextResponse.json({ jobId, generationId: charge.generationId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:face-swap" });

const statusHandler = createJobStatusHandler(jobs, { contentType: "image/jpeg", deleteOnDownload: false });

export const GET = withRateLimit(
  (req: NextRequest) => { sweep(); return statusHandler(req); },
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:face-swap:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:face-swap:cancel" },
);
