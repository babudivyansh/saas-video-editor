import { saveMediaUpload } from "@/lib/media-upload";
import { userMessage, rawErrorText } from "@/lib/user-facing-error";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { trimAudioForProvider, runFFmpegArgs } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { vocalRemoverCredits } from "@/lib/audio-pricing";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import { saveToolResult } from "@/lib/tool-results";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// fal.ai Demucs bills $0.0007/s of processing time. Priced by length since
// 2026-09-26 — 1 credit per 30 seconds, lib/audio-pricing.ts — instead of a
// flat 3 that ran at ~1.1x cost on a 5-minute file after GST. The length cap
// stays: file size alone let a long, low-bitrate file through.
// Real provider $/s, for the AI-spend dashboards (the charge is in credits).
const AUDIO_COST_USD_PER_SEC = 0.0007; // fal.ai Demucs
const MAX_DURATION_SEC = 300; // 5 minutes
const FAL_MODEL = "fal-ai/demucs";

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  inputPath: string;
  createdAt: number;
  /** The vocals stem, saved to Assets alongside the instrumental download. */
  meta?: { vocalsUrl: string | null };
}

interface Stems { instrumental: string; vocals: string | null }

const g = globalThis as unknown as { __vocalRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__vocalRemoverJobs ?? (g.__vocalRemoverJobs = new Map());

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
    throw new Error(`fal.ai storage upload failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return (data.url ?? data.access_url) as string;
}

async function falSubmit(audioUrl: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, stems: "2stems" }),
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

/** Fetch a fal output and re-encode it to MP3 at `outPath`. */
async function downloadAsMp3(url: string, outPath: string, tmpName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download result from fal.ai (${res.status})`);
  const rawPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));
  try {
    await runFFmpegArgs(["-y", "-i", rawPath, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", outPath]);
  } finally {
    try { fs.unlinkSync(rawPath); } catch { /* ignore */ }
  }
}

async function falPollUntilDone(requestId: string): Promise<Stems> {
  // This polls inside the job's detached background promise, AFTER the POST
  // has already returned its jobId — the route's maxDuration does not apply
  // to it. A 90s deadline here only meant that any fal queue backlog failed
  // and refunded the job while fal still finished (and billed) the request.
  // The server-restart case is covered by reconcileOrphanedToolJobs (15 min).
  // Separation takes longer than the image models, hence 8 minutes.
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: falAuth() },
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: falAuth() },
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const url =
        result?.stems?.accompaniment?.url ??
        result?.accompaniment?.url ??
        result?.no_vocals?.url ??
        (result?.audio_url as string | undefined);
      if (!url) throw new Error("No accompaniment URL in fal.ai result");
      // The vocals stem is half of what people use this for (acapellas); it
      // used to be thrown away.
      const vocals = (result?.stems?.vocals?.url ?? result?.vocals?.url ?? null) as string | null;
      return { instrumental: url, vocals };
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "fal.ai separation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("fal.ai vocal removal timed out after 8 minutes");
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Vocal removal is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const policy = await resolveUploadPolicy(auth.userId, "vocal-remover");
  const formData = await readUploadForm(req, policy);
  if (formData instanceof NextResponse) return formData;

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const providerPath = path.join(os.tmpdir(), `${jobId}-provider.mp3`);
  const downloadName = `instrumental-${file.name.replace(/\.[^.]+$/, "")}.mp3`;

  // Write to disk first so we can probe duration BEFORE charging.
  // Safe temp extension + container allow-list (lib/media-upload.ts).
  const saved = await saveMediaUpload(file, jobId, "mp3");
  if (saved instanceof NextResponse) return saved;
  const { inputPath } = saved;

  // 0 means ffmpeg could not probe the file. It used to fall through to the
  // 1-credit minimum while the whole file still went to fal — the same hole
  // voice-changer already closed.
  const durationSec = saved.durationSec;
  if (durationSec <= 0 || durationSec > MAX_DURATION_SEC) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    const message = durationSec <= 0
      ? "Couldn't read this file's duration — it may be corrupted or an unsupported format."
      : `Audio is too long (${Math.round(durationSec)}s). Max is ${MAX_DURATION_SEC / 60} minutes.`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  // Length-scaled price, same function the tool page quotes with.
  const creditCost = vocalRemoverCredits(durationSec);

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: creditCost,
    toolSlug: "vocal-remover",
    idempotencyKey,
    log: { generationType: "audio", estimatedCostUsd: durationSec * AUDIO_COST_USD_PER_SEC },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return replayed;
  }
  if (!charge.ok) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Vocal remover is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${creditCost})` }, { status: 402 });
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
      job.progress = 10;

      // Upload to fal.ai storage — the billed length only, never the raw file
      // (its header duration is what we charged for, and it can lie).
      await trimAudioForProvider(inputPath, providerPath, durationSec, "320k");
      const falUrl = await uploadToFal(fs.readFileSync(providerPath), "audio/mpeg");
      job.progress = 15;

      // Submit to Demucs queue
      const requestId = await falSubmit(falUrl);
      job.progress = 20;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 8000);

      let stems: Stems;
      try {
        stems = await falPollUntilDone(requestId);
      } finally {
        clearInterval(progressTimer);
      }

      if ((job.status as string) === "cancelled") return;
      job.progress = 90;

      // Download the instrumental track. Re-encoded to a real MP3: fal's stem
      // format isn't guaranteed, and it used to be saved as-is under an
      // .mp3 name and an audio/mpeg type.
      await downloadAsMp3(stems.instrumental, outputPath, `${jobId}-instrumental-raw`);
      const audioBuffer = fs.readFileSync(outputPath);
      // The local file serves the web's download; this keeps the result past a
      // restart, on the Generation and in the user's Assets.
      await saveToolResult({
        userId: job.userId,
        generationId: job.generationId,
        toolSlug: "vocal-remover",
        source: { buffer: audioBuffer },
        mimeType: "audio/mpeg",
        name: downloadName,
        durationMs: Math.round(durationSec * 1000),
      });

      // The vocals stem goes to Assets too (no generationId: the Generation's
      // result is the instrumental). Best-effort — the job already succeeded.
      let vocalsUrl: string | null = null;
      if (stems.vocals) {
        const vocalsPath = path.join(os.tmpdir(), `${jobId}-vocals.mp3`);
        try {
          await downloadAsMp3(stems.vocals, vocalsPath, `${jobId}-vocals-raw`);
          const saved = await saveToolResult({
            userId: job.userId,
            toolSlug: "vocal-remover",
            source: { buffer: fs.readFileSync(vocalsPath) },
            mimeType: "audio/mpeg",
            name: downloadName.replace(/^instrumental-/, "vocals-"),
            durationMs: Math.round(durationSec * 1000),
          });
          vocalsUrl = saved.url;
        } catch (e) {
          logger.warn("vocal-remover", "vocals stem not saved", { reason: (e as Error).message });
        } finally {
          try { fs.unlinkSync(vocalsPath); } catch { /* ignore */ }
        }
      }
      job.meta = { vocalsUrl };

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      logger.error("vocal-remover", "job failed", err);
      job.error = userMessage(err, "We couldn't separate the vocals in this file. Your credits were refunded — please try again.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch { /* swallow */ }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
      try { fs.unlinkSync(providerPath); } catch { /* ignore */ }
    }
  })();

  void markQuestComplete(auth.userId, "explore-toolbox");
  // generationId: the durable record a client can read after a restart.
  return NextResponse.json({ jobId, generationId: charge.generationId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:vocal-remover" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:vocal-remover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:vocal-remover:cancel" },
);
