import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { synthesizeVoice } from "@/utils/elevenlabs";
import { resolveVoiceId } from "@/utils/voice-ids";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { markQuestComplete } from "@/lib/quests";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { voiceoverCredits } from "@/lib/audio-pricing";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";

export const maxDuration = 120;

// ElevenLabs Flash TTS bills $0.05/1,000 chars. Priced by length since
// 2026-09-26 — 1 credit per 500 characters, lib/audio-pricing.ts — instead of a
// flat 2 credits that ran at ~1.6x cost at the cap after GST. The cap bounds
// one request, not the margin.
const MAX_CHARS = 2000;

// Result is an S3 URL, not a local file — see image-generator/route.ts's
// identical note. outputPath/downloadName are unused placeholders; the real
// result travels in job.meta.
interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
  meta?: { audioUrl: string; durationMs: number; characters: number; voiceId: string; title: string };
}

const g = globalThis as unknown as { __voiceoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__voiceoverJobs ?? (g.__voiceoverJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

// Standalone voiceover generator (no project needed). Takes a script + voice,
// runs ElevenLabs TTS, stores the mp3 on S3, and returns a playable URL plus
// the spoken duration so the UI can show a player and history entry.
async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    text?: string;
    voiceId?: string;
    title?: string;
    stability?: number;
    similarityBoost?: number;
    exaggeration?: number;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const voiceSlug = (body.voiceId ?? "").trim();

  if (!text) return NextResponse.json({ error: "Script text is required" }, { status: 400 });
  if (!voiceSlug) return NextResponse.json({ error: "A voice is required" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Script is too long (max ${MAX_CHARS} characters)` },
      { status: 400 },
    );
  }
  if (!env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Voice generation is not configured" }, { status: 503 });
  }

  // Length-scaled price, same function the tool page quotes with.
  const creditCost = voiceoverCredits(text.length);

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: creditCost,
    toolSlug: "voiceover",
    idempotencyKey: body.idempotencyKey,
    log: { generationType: "audio", prompt: text, estimatedCostUsd: (text.length / 1000) * 0.05 },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Voiceover generation is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${creditCost})` }, { status: 402 });
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
    creditCost: creditCost,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      const voiceId = resolveVoiceId(voiceSlug);
      job.progress = 20;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      const { audioBuffer, wordTimings } = await synthesizeVoice(text, voiceId, {
        stability: body.stability,
        similarityBoost: body.similarityBoost,
        style: body.exaggeration,
      });

      if ((job.status as string) === "cancelled") return;
      job.progress = 80;

      const durationMs = wordTimings.length ? wordTimings[wordTimings.length - 1].end : 0;

      const key = `voiceovers/${auth.userId}/${randomUUID()}.mp3`;
      const downloadName = `${((body.title ?? "").trim() || "voiceover").replace(/[^\w\s-]/g, "").trim() || "voiceover"}.mp3`;
      const audioUrl = await uploadBufferToS3(audioBuffer, key, "audio/mpeg", downloadName);

      if ((job.status as string) === "cancelled") return;

      job.progress = 100;
      job.status = "done";
      job.meta = {
        audioUrl,
        durationMs,
        characters: text.length,
        voiceId: voiceSlug,
        title: (body.title ?? "").trim() || "Untitled voiceover",
      };
      void markQuestComplete(auth.userId, "hear-yourself-out");
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      logger.error("tools/voiceover", "job failed", err);
      job.status = "error";
      job.error = "Voice generation failed. Please try again.";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", err instanceof Error ? err.message : "unknown error");
        } catch { /* swallow */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:voiceover" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: false }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:voiceover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:voiceover:cancel" },
);
