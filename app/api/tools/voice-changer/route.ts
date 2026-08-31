import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { resolveVoiceId } from "@/utils/voice-ids";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { fetchElevenLabs, ElevenLabsHttpError } from "@/utils/elevenlabs";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// ElevenLabs speech-to-speech bills ~1,000 credits/minute (~$0.20/min) — far
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

const g = globalThis as unknown as { __voiceChangerJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__voiceChangerJobs ?? (g.__voiceChangerJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      cleanupJob(job);
      jobs.delete(id);
    }
  }
}

function cleanupJob(job: Job) {
  for (const f of [job.inputPath, job.outputPath]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
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

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) return NextResponse.json({ error: "No audio file provided" }, { status: 400 });

  const policy = await resolveUploadPolicy(auth.userId, "voice-changer");
  try {
    assertWithinUploadPolicy(policy, audioFile.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const voiceSlug = (formData.get("voiceSlug") as string | null) ?? "adam";
  const removeNoise = (formData.get("removeNoise") as string | null) === "true";
  // ElevenLabs' documented voice_settings.speed range is 0.7-1.2; clamp
  // defensively in case a stale/tampered client sends something outside it.
  const speedRaw = Number(formData.get("speed") ?? 1);
  const speed = Number.isFinite(speedRaw) ? Math.min(1.2, Math.max(0.7, speedRaw)) : 1;
  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;

  // Write the upload to disk first so we can probe its duration BEFORE charging.
  const jobId = randomUUID();
  const ext = (audioFile.name.split(".").pop() ?? "mp3").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${ext}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `voice-changed-${Date.now()}.mp3`;

  fs.writeFileSync(inputPath, Buffer.from(await audioFile.arrayBuffer()));

  // Enforce the length cap (no credit charged yet). A duration of 0 means
  // ffmpeg couldn't probe the file at all (unreadable/unsupported container)
  // rather than a genuinely empty clip — treat that as a rejection too,
  // since letting it through silently bypassed the cost-control cap for any
  // file whose duration couldn't be determined.
  const durationSec = await getMediaDurationSec(inputPath);
  if (durationSec <= 0 || durationSec > MAX_DURATION_SEC) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    const message = durationSec <= 0
      ? "Couldn't read this file's duration — it may be corrupted or an unsupported format."
      : `Audio is too long (${Math.round(durationSec)}s). Max is ${MAX_DURATION_SEC / 60} minutes.`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "voice-changer",
    idempotencyKey,
    log: { generationType: "audio" },
  });
  if (!charge.ok) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Voice changer is temporarily disabled." }, { status: 503 });
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
      const voiceId = resolveVoiceId(voiceSlug);

      job.progress = 10;

      const elForm = new FormData();
      const inputBlob = new Blob([fs.readFileSync(inputPath)], { type: audioFile.type || "audio/mpeg" });
      elForm.append("audio", inputBlob, audioFile.name);
      elForm.append("model_id", "eleven_multilingual_sts_v2");
      elForm.append("voice_settings", JSON.stringify({ stability: 0.5, similarity_boost: 0.75, speed }));
      elForm.append("remove_background_noise", String(removeNoise));

      job.progress = 20;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const res = await fetchElevenLabs(
        `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`,
        { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY! }, body: elForm },
        { timeoutMs: 60_000, errorContext: "ElevenLabs error" },
      );

      if ((job.status as string) === "cancelled") return;
      job.progress = 60;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      job.progress = 95;

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
      if (err instanceof ElevenLabsHttpError) {
        logger.error("voice-changer", `ElevenLabs error ${err.status}`, err.body);
        job.error = err.status === 429
          ? "The voice engine is busy right now — please try again in a moment."
          : err.status >= 500
            ? "The voice engine is temporarily unavailable — please try again."
            : "Couldn't convert this audio — try a different voice or file.";
      } else {
        job.error = err instanceof Error ? err.message : "Voice change failed";
      }
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

  void markQuestComplete(auth.userId, "explore-toolbox");
  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:voice-changer" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:voice-changer:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:voice-changer:cancel" },
);
