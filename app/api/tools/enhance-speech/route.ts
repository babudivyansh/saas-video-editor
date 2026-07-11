import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// ElevenLabs audio-isolation bills ~1,000 credits/minute (~$0.20/min) — far
// more than the Flash TTS model used elsewhere. 6 credits + a 90s cap keeps
// real cost (~$0.30 = ~₹28.5 at the 90s cap) comfortably under revenue even
// at the cheapest per-credit plan (Studio Yearly, ~₹9.41/credit = ~₹56.5).
const CREDIT_COST = 6;
const MAX_DURATION_SEC = 90;

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  inputPath: string;
  createdAt: number;
}

const g = globalThis as unknown as { __enhanceSpeechJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__enhanceSpeechJobs ?? (g.__enhanceSpeechJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
  }

  const jobId = randomUUID();
  const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${ext}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `enhanced-${file.name.replace(/\.[^.]+$/, "")}.mp3`;

  // Write to disk first so we can probe duration BEFORE charging.
  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

  const durationSec = await getMediaDurationSec(inputPath);
  if (durationSec > MAX_DURATION_SEC) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return NextResponse.json(
      { error: `Audio is too long (${Math.round(durationSec)}s). Max is ${MAX_DURATION_SEC / 60} minutes.` },
      { status: 400 },
    );
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "enhance-speech",
    idempotencyKey,
    log: { generationType: "audio" },
  });
  if (!charge.ok) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Speech enhancer is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

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

  (async () => {
    try {
      job.progress = 20;

      const elForm = new FormData();
      const blob = new Blob([fs.readFileSync(inputPath)], { type: file.type || "audio/mpeg" });
      elForm.append("audio", blob, file.name);

      job.progress = 30;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const res = await withRetry(
        (signal) => fetch("https://api.elevenlabs.io/v1/audio-isolation", {
          method: "POST",
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
          body: elForm,
          signal,
        }),
        { timeoutMs: 60_000 },
      );

      if ((job.status as string) === "cancelled") return;
      job.progress = 80;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outputPath, audioBuffer);

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Enhancement failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:enhance-speech" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:enhance-speech:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:enhance-speech:cancel" },
);
