import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { fal } from "@fal-ai/client";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";

export const maxDuration = 120;

const CREDIT_COST = 2;
const FAL_MODEL = "fal-ai/face-swap";

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  inputPaths: string[];
  createdAt: number;
}

const g = globalThis as unknown as { __faceSwapJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__faceSwapJobs ?? (g.__faceSwapJobs = new Map());

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

function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

async function uploadToFal(buffer: Buffer, mimeType: string): Promise<string> {
  fal.config({ credentials: env.FAL_KEY! });
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  return fal.storage.upload(blob);
}

async function submitToFal(swapImageUrl: string, baseImageUrl: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({
        swap_image_url: swapImageUrl,   // the face to use (character image)
        base_image_url: baseImageUrl,   // the target to swap into
      }),
      signal,
    }),
    { timeoutMs: 15_000 },
  );
  if (!res.ok) throw new Error(`fal.ai submit error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.request_id as string;
}

async function pollFal(requestId: string): Promise<string> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: falAuth() }
    );
    if (!statusRes.ok) continue;
    const s = await statusRes.json();
    if (s.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: falAuth() }
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const url = result?.image?.url ?? result?.images?.[0]?.url ?? result?.output?.url;
      if (!url) throw new Error("No image URL in fal.ai result");
      return url as string;
    }
    if (s.status === "FAILED") throw new Error(s.error ?? "fal.ai face swap failed");
  }
  throw new Error("Face swap timed out");
}

// POST – start job
async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Face swap not configured (missing FAL_KEY)" }, { status: 503 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 }); }

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
    if (f.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Each image must be under 10 MB" }, { status: 413 });
    }
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "face-swap",
    idempotencyKey,
    log: { generationType: "image" },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Face swap is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  const jobId = randomUUID();
  const charExt = (characterFile.name.split(".").pop() ?? "jpg").toLowerCase();
  const targExt = (targetFile.name.split(".").pop() ?? "jpg").toLowerCase();
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
        uploadToFal(fs.readFileSync(charPath), characterFile.type),
        uploadToFal(fs.readFileSync(targPath), targetFile.type),
      ]);
      job.progress = 35;

      const requestId = await submitToFal(charUrl, targUrl);
      job.progress = 45;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const ticker = setInterval(() => {
        if (job.progress < 85) job.progress += 4;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 3000);

      let resultUrl: string;
      try { resultUrl = await pollFal(requestId); }
      finally { clearInterval(ticker); }

      if ((job.status as string) === "cancelled") return;

      job.progress = 90;

      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) throw new Error("Failed to download result");
      fs.writeFileSync(outputPath, Buffer.from(await dlRes.arrayBuffer()));

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
      job.error = msg;
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

  return NextResponse.json({ jobId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:face-swap" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "image/jpeg", deleteOnDownload: false }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:face-swap:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:face-swap:cancel" },
);
