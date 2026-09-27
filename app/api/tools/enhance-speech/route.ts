import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { fetchElevenLabs } from "@/utils/elevenlabs";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { voiceFxCredits } from "@/lib/audio-pricing";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// ElevenLabs audio-isolation bills ~$0.20/min — far more than the Flash TTS
// model used elsewhere. Priced by length since 2026-09-26 — 8 credits per
// minute, lib/audio-pricing.ts — instead of a flat 6 that ran at ~1.6x cost at
// the 90s cap after GST.
// Real provider $/s, for the AI-spend dashboards (the charge is in credits).
const AUDIO_COST_USD_PER_SEC = 0.20 / 60; // ~$0.20/min ElevenLabs voice isolation
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

  const policy = await resolveUploadPolicy(auth.userId, "enhance-speech");
  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
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
  // Length-scaled price, same function the tool page quotes with.
  const creditCost = voiceFxCredits(durationSec);

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: creditCost,
    toolSlug: "enhance-speech",
    idempotencyKey,
    log: { generationType: "audio", estimatedCostUsd: durationSec * AUDIO_COST_USD_PER_SEC },
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
    creditCost: creditCost,
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

      const res = await fetchElevenLabs(
        "https://api.elevenlabs.io/v1/audio-isolation",
        { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY! }, body: elForm },
        { timeoutMs: 60_000, errorContext: "ElevenLabs error" },
      );

      if ((job.status as string) === "cancelled") return;
      job.progress = 80;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

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
