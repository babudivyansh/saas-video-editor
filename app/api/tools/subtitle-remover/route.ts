import { saveMediaUpload } from "@/lib/media-upload";
import { userMessage, rawErrorText } from "@/lib/user-facing-error";
import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getAuthUser } from "@/lib/auth";
import { runFFmpegArgs, runFFmpegWithProgress, encodeArgs, probeVideoStream } from "@/utils/ffmpeg-render";
import { uploadFileToS3, getPresignedUrl, deleteS3Object } from "@/utils/s3-upload";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { saveToolResult } from "@/lib/tool-results";
import { subtitleRemoverCredits, SUBTITLE_REMOVER_MAX_SEC, type SubtitleRemoverMode } from "@/lib/subtitle-remover-pricing";
import {
  parseOcrRegions, captionBands, parseUserRegions, userRegionsToPatches, buildDelogoFilter, pngSize, sampleFpsFor,
  type Box, type Detection, type FrameSize, type PatchRegion,
} from "@/lib/subtitle-remover/regions";
import { createRemoveSubtitleTask, waitForTask, isSafeResultUrl, PIAPI_MAX_BYTES, PIAPI_MAX_SEC } from "@/lib/subtitle-remover/piapi";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress, checkModelAccess } from "@/lib/credits";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// How many frames to OCR at once, so one job doesn't flood fal.
const OCR_CONCURRENCY = 4;
// OCR frames are scaled down to this width: Florence-2 works at 768 px anyway,
// and 150 full-size 4K PNGs would be over a gigabyte of temp files.
const OCR_FRAME_MAX_WIDTH = 1280;
// Jobs running at once across the whole server. Every job ends in an encode on
// the shared host, so more than this are refused before anything is charged.
const MAX_ACTIVE_JOBS = 3;
// PiAPI's processing time is unpublished; give up (and refund) after this.
const AI_TASK_TIMEOUT_MS = 25 * 60 * 1000;
// Largest result we will download from PiAPI.
const AI_RESULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  inputPath: string;
  createdAt: number;
  /** regionsDetected: -1 when the provider doesn't report it (AI erase). */
  meta?: { regionsDetected: number; refunded: boolean; mode: SubtitleRemoverMode };
}

const g = globalThis as unknown as { __subtitleRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__subtitleRemoverJobs ?? (g.__subtitleRemoverJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff && job.status !== "processing") {
      for (const f of [job.inputPath, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}

const isCancelled = (job: Job) => (job.status as string) === "cancelled";

function setProgress(job: Job, pct: number) {
  job.progress = Math.max(job.progress, Math.min(99, Math.round(pct)));
  if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
}

/** The displayed frame size (after rotation), read from one decoded frame. */
async function displayFrameSize(inputPath: string, workDir: string): Promise<FrameSize | null> {
  const out = path.join(workDir, "probe.png");
  try {
    await runFFmpegArgs(["-y", "-i", inputPath, "-frames:v", "1", out], 60_000);
    return pngSize(fs.readFileSync(out));
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(out); } catch { /* ignore */ }
  }
}

async function detectTextInFrame(framePath: string): Promise<Box[]> {
  const blob = new Blob([new Uint8Array(fs.readFileSync(framePath))], { type: "image/png" });
  const imageUrl = await withRetry(() => fal.storage.upload(blob), { timeoutMs: 20_000 });
  // A hung fal queue used to hold the job "processing" until the client gave up.
  const { data } = await withRetry(
    (signal) => fal.subscribe("fal-ai/florence-2-large/ocr-with-region", { input: { image_url: imageUrl }, logs: false, abortSignal: signal }),
    { timeoutMs: 60_000, maxAttempts: 2 },
  );
  return parseOcrRegions(data);
}

/** Bottom-third mode: sample frames, OCR them, and return the caption bands to patch. */
async function findCaptionBands(job: Job, inputPath: string, durationSec: number, frame: FrameSize, workDir: string): Promise<PatchRegion[] | null> {
  fal.config({ credentials: env.FAL_KEY });
  const framesDir = path.join(workDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const sampleFps = sampleFpsFor(durationSec);
  const intervalSec = 1 / sampleFps;
  await runFFmpegArgs([
    "-y", "-i", inputPath,
    "-vf", `fps=${sampleFps},scale='min(${OCR_FRAME_MAX_WIDTH},iw)':-2`,
    path.join(framesDir, "frame-%04d.png"),
  ]);
  setProgress(job, 12);
  if (isCancelled(job)) return null;

  const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort();
  if (frameFiles.length === 0) throw new Error("no frames could be read from this video");
  const ocrSize = pngSize(fs.readFileSync(path.join(framesDir, frameFiles[0])));
  if (!ocrSize) throw new Error("sampled frame unreadable");
  const scale = frame.w / ocrSize.w;

  const detections: Detection[] = [];
  let failures = 0;
  for (let i = 0; i < frameFiles.length; i += OCR_CONCURRENCY) {
    if (isCancelled(job)) return null;
    const batch = frameFiles.slice(i, i + OCR_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((f) => detectTextInFrame(path.join(framesDir, f))));
    results.forEach((r, j) => {
      const t = (i + j) * intervalSec;
      if (r.status === "fulfilled") {
        for (const b of r.value) detections.push({ x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale, t });
      } else {
        failures++;
        logger.error("subtitle-remover", "OCR call failed for a sampled frame", r.reason);
      }
    });
    setProgress(job, 12 + ((i + batch.length) / frameFiles.length) * 38);
  }
  // Every call failing is an outage, not "no text in this video"; most of them
  // failing would quietly leave captions on screen.
  if (failures > frameFiles.length / 2) throw new Error(`${failures} of ${frameFiles.length} OCR calls failed`);

  return captionBands(detections, frame, intervalSec);
}

/** Patches the regions with delogo and re-encodes (one libx264 thread: see encodeArgs). */
async function encodePatched(job: Job, inputPath: string, outputPath: string, regions: PatchRegion[], durationSec: number, from: number) {
  const filter = buildDelogoFilter(regions);
  if (!filter) throw new Error("nothing to patch");
  await runFFmpegWithProgress(
    ["-y", "-i", inputPath, "-vf", filter, "-map", "0:v:0", "-map", "0:a:0?", ...encodeArgs("cpu"), outputPath],
    (pct) => setProgress(job, from + (pct / 100) * (99 - from)),
    { totalSec: durationSec, stallMs: 3 * 60 * 1000 },
  );
}

/**
 * The MP4 PiAPI accepts: regular (not fragmented), no rotation metadata, one
 * video track, at most 60 MiB. The audio is left out and put back afterwards,
 * so it never has to share the 60 MiB.
 */
async function prepareProviderInput(inputPath: string, durationSec: number, workDir: string): Promise<string> {
  const out = path.join(workDir, "provider-input.mp4");
  const info = await probeVideoStream(inputPath);
  const tooBig = () => fs.statSync(out).size > PIAPI_MAX_BYTES;

  if (info.codec === "h264" && info.pixFmt === "yuv420p" && !info.rotated) {
    await runFFmpegArgs(["-y", "-i", inputPath, "-map", "0:v:0", "-an", "-c:v", "copy", "-movflags", "+faststart", out]);
    if (!tooBig()) return out;
  }
  // Re-encode upright (ffmpeg applies the rotation), at most 1080 on the short side.
  const scale = "scale='if(gte(iw,ih),-2,min(1080,iw))':'if(gte(iw,ih),min(1080,ih),-2)'";
  const base = ["-y", "-i", inputPath, "-map", "0:v:0", "-an", "-vf", scale, "-threads", "1", "-c:v", "libx264", "-preset", "superfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  await runFFmpegArgs([...base, "-crf", "23", out]);
  if (!tooBig()) return out;
  // Still too big: spend exactly the budget (92% of it, for container overhead).
  const bps = Math.floor((PIAPI_MAX_BYTES * 0.92 * 8) / Math.max(1, durationSec));
  await runFFmpegArgs([...base, "-b:v", String(bps), "-maxrate", String(bps), "-bufsize", String(bps * 2), out]);
  if (tooBig()) throw new Error("couldn't make this video small enough for AI erase");
  return out;
}

async function downloadResult(url: string, dest: string) {
  if (!isSafeResultUrl(url)) throw new Error("AI erase returned an unexpected result address");
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`couldn't download the AI erase result (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > AI_RESULT_MAX_BYTES) throw new Error("AI erase result too large");
  let seen = 0;
  const body = Readable.fromWeb(res.body as import("stream/web").ReadableStream<Uint8Array>);
  body.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > AI_RESULT_MAX_BYTES) body.destroy(new Error("AI erase result too large"));
  });
  await pipeline(body, fs.createWriteStream(dest));
}

/** Anywhere mode: PiAPI erases the text and fills the background; we put the original audio back. */
async function runAiErase(job: Job, jobId: string, inputPath: string, outputPath: string, durationSec: number, workDir: string): Promise<boolean> {
  const apiKey = env.PIAPI_API_KEY;
  if (!apiKey) throw new Error("AI erase is not configured");
  const providerInput = await prepareProviderInput(inputPath, durationSec, workDir);
  setProgress(job, 15);
  if (isCancelled(job)) return false;

  const key = `tool-inputs/subtitle-remover/${job.userId}/${jobId}.mp4`;
  await uploadFileToS3(providerInput, key, "video/mp4");
  try {
    setProgress(job, 20);
    const task = await createRemoveSubtitleTask(apiKey, await getPresignedUrl(key, 2 * 60 * 60));
    const resultUrl = await waitForTask(apiKey, task.taskId, {
      timeoutMs: AI_TASK_TIMEOUT_MS,
      shouldStop: () => isCancelled(job),
      // PiAPI reports no percentage: creep towards 85% over a few minutes.
      onStatus: (_s, elapsed) => setProgress(job, 20 + 65 * (1 - Math.exp(-elapsed / (3 * 60 * 1000)))),
    });
    if (isCancelled(job)) return false;

    const erased = path.join(workDir, "provider-output.mp4");
    await downloadResult(resultUrl, erased);
    setProgress(job, 90);
    // Video as PiAPI returned it, audio from the original upload. No video re-encode.
    await runFFmpegArgs([
      "-y", "-i", erased, "-i", inputPath,
      "-map", "0:v:0", "-map", "1:a:0?",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      outputPath,
    ]);
    return true;
  } finally {
    // The input only had to live until PiAPI fetched it.
    deleteS3Object(key).catch((err) => logger.error("subtitle-remover", "couldn't delete provider input", err));
  }
}

function cleanup(inputPath: string, workDir: string) {
  try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pro+ only while fal's per-frame OCR cost is unverified (see lib/tool-costs.ts).
  const access = await checkModelAccess(auth.userId, { allowedTiers: ["pro", "studio"] });
  if (!access.allowed) {
    return NextResponse.json(
      { error: `Subtitle Remover requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const active = [...jobs.values()].filter((j) => j.status === "processing").length;
  if (active >= MAX_ACTIVE_JOBS) {
    return NextResponse.json({ error: "Subtitle Remover is busy right now. Please try again in a minute." }, { status: 429 });
  }

  const policy = await resolveUploadPolicy(auth.userId, "subtitle-remover");
  const formData = await readUploadForm(req, policy);
  if (formData instanceof NextResponse) return formData;

  // "bottom" (default): AI finds the captions in the bottom third.
  // "region": the user marked the boxes. "auto": AI erase anywhere (PiAPI).
  const rawArea = formData.get("area");
  const mode: SubtitleRemoverMode = rawArea === "auto" || rawArea === "region" ? rawArea : "bottom";
  if (mode === "bottom" && !env.FAL_KEY) {
    return NextResponse.json({ error: "Automatic caption finding isn't available right now. Mark the captions yourself instead." }, { status: 503 });
  }
  if (mode === "auto" && !env.PIAPI_API_KEY) {
    return NextResponse.json({ error: "AI erase isn't available right now." }, { status: 503 });
  }
  let userRegions: Box[] | null = null;
  if (mode === "region") {
    userRegions = parseUserRegions(formData.get("regions"));
    if (!userRegions) return NextResponse.json({ error: "Mark at least one caption area (up to 4)." }, { status: 400 });
  }

  const videoFile = formData.get("video") as File | null;
  if (!videoFile) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

  try {
    assertWithinUploadPolicy(policy, videoFile.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const workDir = path.join(os.tmpdir(), `${jobId}-work`);
  const downloadName = `subtitle-removed-${Date.now()}.mp4`;

  // Safe temp extension + container allow-list (lib/media-upload.ts).
  const saved = await saveMediaUpload(videoFile, jobId, "mp4");
  if (saved instanceof NextResponse) return saved;
  const { inputPath, durationSec } = saved;
  const reject = (error: string) => {
    cleanup(inputPath, workDir);
    return NextResponse.json({ error }, { status: 400 });
  };

  // An undetectable duration means ffmpeg couldn't read the file at all.
  if (durationSec <= 0) return reject("Couldn't read this video's duration — it may be corrupted or an unsupported format.");
  if (durationSec > SUBTITLE_REMOVER_MAX_SEC || (mode === "auto" && durationSec > PIAPI_MAX_SEC)) {
    return reject(`This video is ${Math.round(durationSec / 60)} minutes long. Subtitle Remover handles up to ${SUBTITLE_REMOVER_MAX_SEC / 60} minutes.`);
  }
  if (mode === "auto" && durationSec < 1) return reject("AI erase needs a video at least 1 second long.");

  // The size boxes are measured against: the frame as displayed, after any
  // rotation, which is what OCR sees and what the user drew on.
  fs.mkdirSync(workDir, { recursive: true });
  const frame = mode === "auto" ? null : await displayFrameSize(inputPath, workDir);
  if (mode !== "auto" && !frame) return reject("Couldn't read a frame from this video — it may be corrupted or an unsupported format.");

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const creditCost = subtitleRemoverCredits(durationSec, mode);
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: creditCost,
    toolSlug: "subtitle-remover",
    idempotencyKey,
    log: { generationType: "video" },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) {
    cleanup(inputPath, workDir);
    return replayed;
  }
  if (!charge.ok) {
    cleanup(inputPath, workDir);
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Subtitle remover is temporarily disabled." }, { status: 503 });
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
    creditCost,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      let regionsDetected = -1;
      if (mode === "auto") {
        if (!(await runAiErase(job, jobId, inputPath, outputPath, durationSec, workDir))) return;
      } else {
        const regions = mode === "region"
          ? userRegionsToPatches(userRegions!, frame!)
          : await findCaptionBands(job, inputPath, durationSec, frame!, workDir);
        if (regions === null || isCancelled(job)) return;
        regionsDetected = regions.length;

        if (regions.length === 0) {
          // Nothing to remove: no encode, no result, no charge.
          job.meta = { regionsDetected: 0, refunded: true, mode };
          job.refunded = true;
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", "No captions found — credits refunded");
          job.progress = 100;
          job.status = "done";
          return;
        }
        await encodePatched(job, inputPath, outputPath, regions, durationSec, mode === "region" ? 10 : 50);
      }

      if (isCancelled(job)) return;
      job.finalizing = true;
      job.meta = { regionsDetected, refunded: false, mode };
      // The local file serves the web's download; this keeps the result past a
      // restart, on the Generation and in the user's Assets.
      await saveToolResult({ userId: job.userId, generationId: job.generationId, toolSlug: "subtitle-remover", source: { filePath: outputPath }, mimeType: "video/mp4", name: downloadName, durationMs: Math.round(durationSec * 1000) });

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if (isCancelled(job)) return;
      job.status = "error";
      logger.error("subtitle-remover", `job failed (${mode})`, err);
      job.error = userMessage(err, "We couldn't remove the subtitles from this video. Your credits were refunded — please try again.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch { /* swallow */ }
      }
    } finally {
      cleanup(inputPath, workDir);
    }
  })();

  // generationId: the durable record a client can read after a restart.
  return NextResponse.json({ jobId, generationId: charge.generationId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover" });

const statusHandler = createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true });

/** `?capabilities=1`: which modes this server can run, so the page offers only those. */
async function handleGET(req: NextRequest) {
  if (new URL(req.url).searchParams.get("capabilities")) {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ bottom: !!env.FAL_KEY, region: true, auto: !!env.PIAPI_API_KEY });
  }
  return statusHandler(req);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover:status" });

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover:cancel" },
);
