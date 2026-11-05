import { saveMediaUpload } from "@/lib/media-upload";
import { userMessage, rawErrorText } from "@/lib/user-facing-error";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markQuestComplete } from "@/lib/quests";
import { trimAudioForProvider, runFFmpegArgs } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
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
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";
import { falUpload, falSubmit, falPollUntilDone, falCancel } from "@/lib/fal";
import { DEMUCS_MODEL, INSTRUMENTAL_STEMS, demucsStems, type Stems } from "@/lib/demucs";

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

const g = globalThis as unknown as { __vocalRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__vocalRemoverJobs ?? (g.__vocalRemoverJobs = new Map());

// Runs on every POST and poll, so old temp files don't wait for the next job.
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

/** Fetch a fal output and re-encode it to MP3 at `outPath`. */
async function downloadAsMp3(url: string, outPath: string, tmpName: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
  if (!res.ok) throw new Error(`Failed to download result from fal.ai (${res.status})`);
  const rawPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));
  try {
    await runFFmpegArgs(["-y", "-i", rawPath, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", outPath]);
  } finally {
    try { fs.unlinkSync(rawPath); } catch { /* ignore */ }
  }
}

/** Download the non-vocal stems and mix them into one MP3 at `outPath`. */
async function mixInstrumental(urls: string[], outPath: string, jobId: string): Promise<void> {
  if (urls.length === 1) return downloadAsMp3(urls[0], outPath, `${jobId}-instrumental-raw`);
  const parts: string[] = [];
  try {
    for (const [i, url] of urls.entries()) {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
      if (!res.ok) throw new Error(`Failed to download a stem from fal.ai (${res.status})`);
      const p = path.join(os.tmpdir(), `${jobId}-stem-${i}`);
      fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
      parts.push(p);
    }
    // amix averages its inputs (divides by their count); the volume filter
    // undoes that, so the stems sum back to the original level. Spelled this
    // way, not amix's normalize=0, which older FFmpeg builds don't have.
    await runFFmpegArgs([
      "-y",
      ...parts.flatMap((p) => ["-i", p]),
      "-filter_complex", `amix=inputs=${parts.length}:duration=longest:dropout_transition=0,volume=${parts.length}`,
      "-vn", "-c:a", "libmp3lame", "-b:a", "320k", outPath,
    ]);
  } finally {
    for (const p of parts) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  }
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
      const falUrl = await falUpload(fs.readFileSync(providerPath), "audio/mpeg");
      if ((job.status as string) === "cancelled") return;
      job.progress = 15;

      // Submit to Demucs queue. `stems` is a list (fal rejects a string).
      const request = await falSubmit(FAL_MODEL, {
        audio_url: falUrl,
        model: DEMUCS_MODEL,
        stems: ["vocals", ...INSTRUMENTAL_STEMS],
        output_format: "mp3",
      });
      const abort = new AbortController();
      job.onCancel = () => { abort.abort(); return falCancel(request); };
      if ((job.status as string) === "cancelled") { await job.onCancel(); return; }
      job.progress = 20;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 8000);

      let stems: Stems;
      try {
        // Runs after the POST returned, so maxDuration doesn't bound it; a
        // restart mid-job is covered by reconcileOrphanedToolJobs (15 min).
        // Separation takes longer than the image models, hence 8 minutes.
        const raw = await falPollUntilDone(request, { deadlineMs: 8 * 60_000, pollIntervalMs: 5000, signal: abort.signal });
        stems = demucsStems(raw);
      } finally {
        clearInterval(progressTimer);
      }

      if ((job.status as string) === "cancelled") return;
      // The result is the user's from here: a cancel would refund it anyway.
      job.finalizing = true;
      job.progress = 90;

      // Mix the instrumental stems into one MP3.
      await mixInstrumental(stems.instrumental, outputPath, jobId);
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

const statusHandler = createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true });

export const GET = withRateLimit(
  (req: NextRequest) => { sweep(); return statusHandler(req); },
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:vocal-remover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:vocal-remover:cancel" },
);
