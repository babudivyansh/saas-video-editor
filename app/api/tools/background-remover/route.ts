import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";

export const maxDuration = 120;

const CREDIT_COST = 1;
// fal.ai rembg model – removes background from images (PNG/JPG/WEBP)
const FAL_MODEL = "fal-ai/imageutils/rembg";

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  inputPath: string;
  createdAt: number;
}

const g = globalThis as unknown as { __bgRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__bgRemoverJobs ?? (g.__bgRemoverJobs = new Map());

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

function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

async function uploadToFal(buffer: Buffer, mimeType: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch("https://storage.fal.run", {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": mimeType },
      body: new Uint8Array(buffer),
      signal,
    }),
    { timeoutMs: 30_000 },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai upload failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return (data.url ?? data.access_url) as string;
}

async function submitToFal(imageUrl: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
      signal,
    }),
    { timeoutMs: 15_000 },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai submit error ${res.status}: ${txt}`);
  }
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
    const statusData = await statusRes.json();
    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: falAuth() }
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const url = result?.image?.url ?? result?.output?.url ?? result?.url;
      if (!url) throw new Error("No image URL in fal.ai result");
      return url as string;
    }
    if (statusData.status === "FAILED") {
      throw new Error(statusData.error ?? "fal.ai background removal failed");
    }
  }
  throw new Error("Background removal timed out");
}

// POST – start a job
async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Background remover not configured (missing FAL_KEY)" }, { status: 503 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, WEBP, GIF images are supported" }, { status: 400 });
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB for images
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "background-remover",
    idempotencyKey,
    log: { generationType: "image" },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Background remover is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits (need 1)" }, { status: 402 });
  }

  const jobId = randomUUID();
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
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
      const falUrl = await uploadToFal(fileBuffer, file.type);
      job.progress = 30;

      const requestId = await submitToFal(falUrl);
      job.progress = 40;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      // Tick progress while waiting
      const ticker = setInterval(() => {
        if (job.progress < 85) job.progress += 5;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 3000);

      let resultUrl: string;
      try {
        resultUrl = await pollFal(requestId);
      } finally {
        clearInterval(ticker);
      }

      if ((job.status as string) === "cancelled") return;
      job.progress = 90;

      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) throw new Error("Failed to download result");
      const buf = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, buf);

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Unknown error";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch (e) { logger.error("background-remover", "refund failed", e); }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
  })();

  return NextResponse.json({ jobId });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:background-remover" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "image/png", deleteOnDownload: false }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:background-remover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:background-remover:cancel" },
);
