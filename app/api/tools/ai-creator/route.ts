import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { uploadBufferToS3, getPresignedUrl, deleteS3Object } from "@/utils/s3-upload";
import { runFFmpegArgs, getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { chargeCredits, refundCredits, markGenerationStatus, checkModelAccess, updateGenerationProgress } from "@/lib/credits";
import { maxDurationForTier } from "@/lib/plans/tiers";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import { adoptUploadedBytes } from "@/lib/asset-service";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const TOOL_COST = TOOL_COSTS["ai-creator"];
// TOOL_COST.requiredTier is "pro" — allowedTiers must be every tier at or
// above it. Only ai-creator declares a requiredTier in Phase 1, so this is
// hardcoded rather than derived generically; see lib/credits.ts's
// checkModelAccess for the shared gating mechanism.
const AI_CREATOR_ALLOWED_TIERS = ["pro", "studio"] as const;

// Optional preset face images — set these in .env as public S3 URLs.
// If not configured, those preset options return a clear error asking the user
// to upload their own face image instead.
const PRESET_AVATAR_URLS: Record<string, string | undefined> = {
  "nano-banana": env.PRESET_AVATAR_NANO_BANANA_URL,
  "face-swap":   env.PRESET_AVATAR_FACE_SWAP_URL,
};

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
  tempFiles: string[];
  meta?: { trimmedToSeconds: number; sourceDurationSeconds: number };
  /** S3 keys uploaded for this job (user's audio/face image) — deleted once
   * fal.ai has consumed them, since they're privacy-sensitive and were
   * previously left on a permanent public URL indefinitely. */
  s3Keys: string[];
}

const g = globalThis as unknown as { __aiCreatorJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__aiCreatorJobs ?? (g.__aiCreatorJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of job.tempFiles) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
      for (const key of job.s3Keys) { void deleteS3Object(key).catch(() => {}); }
      jobs.delete(id);
    }
  }
}

async function deleteJobS3Objects(job: Job) {
  for (const key of job.s3Keys) {
    try { await deleteS3Object(key); } catch { /* best-effort */ }
  }
}

function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

async function falSubmit(input: Record<string, unknown>): Promise<string> {
  const res = await withRetry(
    (signal) => fetch("https://queue.fal.run/fal-ai/sadtalker", {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
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

async function falPollUntilDone(requestId: string): Promise<string> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://queue.fal.run/fal-ai/sadtalker/requests/${requestId}/status`,
      { headers: falAuth() },
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/fal-ai/sadtalker/requests/${requestId}`,
        { headers: falAuth() },
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const videoUrl = result.video?.url as string | undefined;
      if (!videoUrl) throw new Error("No video URL in fal.ai result");
      return videoUrl;
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "SadTalker generation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("SadTalker generation timed out after 10 minutes");
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "AI Creator is not configured (missing FAL_KEY)" }, { status: 503 });
  }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET) {
    return NextResponse.json({ error: "AI Creator is not configured (missing AWS credentials)" }, { status: 503 });
  }

  const access = await checkModelAccess(auth.userId, { allowedTiers: AI_CREATOR_ALLOWED_TIERS });
  if (!access.allowed) {
    return NextResponse.json(
      { error: `AI Creator requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const videoFile = formData.get("video") as File | null;
  if (!videoFile) return NextResponse.json({ error: "No video provided" }, { status: 400 });

  // effectiveMaxBytes = min(plan upload cap, AI Creator's 200MB technical
  // cap) — previously a flat 200MB for every tier, unlike this route's
  // duration logic below which already correctly combines the two.
  const uploadPolicy = await resolveUploadPolicy(auth.userId, "ai-creator");
  try {
    assertWithinUploadPolicy(uploadPolicy, videoFile.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, uploadPolicy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const avatarType = (formData.get("avatarType") as string | null) ?? "upload";
  const avatarImageFile = formData.get("avatarImage") as File | null;
  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;

  if (avatarType !== "upload") {
    if (!PRESET_AVATAR_URLS[avatarType]) {
      return NextResponse.json(
        { error: `Preset avatar "${avatarType}" is not configured. Please upload your own face image instead.` },
        { status: 400 },
      );
    }
  } else if (!avatarImageFile) {
    return NextResponse.json({ error: "Please upload a face image for the avatar." }, { status: 400 });
  }

  const jobId = randomUUID();
  const videoExt = (videoFile.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputVideoPath = path.join(os.tmpdir(), `${jobId}-video.${videoExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `ai-creator-${Date.now()}.mp4`;
  const tempFiles: string[] = [inputVideoPath, outputPath];

  const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
  fs.writeFileSync(inputVideoPath, videoBuffer);

  // Global Asset Library: the driving video is a genuine user input that was
  // previously only ever used locally (for audio extraction) and never
  // persisted. Adopt it now, best-effort — never blocks or fails the job.
  adoptUploadedBytes({
    userId: auth.userId,
    bytes: videoBuffer,
    mimeType: videoFile.type || "video/mp4",
    name: videoFile.name || "ai-creator-source",
    sourceFeature: "ai-creator",
    sourceJobId: jobId,
  }).catch((e) => {
    logger.warn("ai-creator", "best-effort source-video asset adoption failed", { reason: (e as Error).message });
  });

  // Output duration matches the driven audio's duration, which (in the normal
  // case) is extracted from the uploaded video — so the video's own duration
  // is an accurate proxy for what gets billed. Clamp to the user's plan-tier
  // ceiling (same TIER_MAX_DURATION_SECONDS used by video-generator) and trim
  // the extracted audio to match below, so a long upload can't be billed (or
  // rendered) past what the tier allows.
  const userTier = await getUserTier(auth.userId);
  const tierCap = maxDurationForTier(userTier);
  const rawDuration = await getMediaDurationSec(inputVideoPath);
  const effectiveDuration = rawDuration || TOOL_COST.defaultDurationSeconds!;
  const ceiling = Math.min(TOOL_COST.maxDurationSeconds!, tierCap);
  // Bill (and produce) only what's actually achievable — previously this
  // also applied a `minDurationSeconds` floor here, which overcharged a
  // short upload: ffmpeg's `-t` can't extend audio past what the source
  // actually contains, so a source shorter than that floor was billed for
  // seconds the output could never contain.
  const duration = Math.min(effectiveDuration, ceiling);
  const wasClampedByCeiling = effectiveDuration > ceiling;
  const CREDIT_COST = Math.ceil(TOOL_COST.creditsPerSecond! * duration);

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "ai-creator",
    idempotencyKey,
    log: { generationType: "video", estimatedCostUsd: (TOOL_COST.costUsd ?? 0) * duration },
  });
  if (!charge.ok) {
    try { fs.unlinkSync(inputVideoPath); } catch { /* ignore */ }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "AI Creator is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  let avatarImagePath: string | null = null;
  if (avatarType === "upload" && avatarImageFile) {
    const imgExt = (avatarImageFile.name.split(".").pop() ?? "jpg").toLowerCase();
    avatarImagePath = path.join(os.tmpdir(), `${jobId}-avatar.${imgExt}`);
    const avatarBuffer = Buffer.from(await avatarImageFile.arrayBuffer());
    fs.writeFileSync(avatarImagePath, avatarBuffer);
    tempFiles.push(avatarImagePath);

    // Same rationale as the driving video above — the face photo is a real
    // user input, persisted best-effort so it's reusable from the library.
    adoptUploadedBytes({
      userId: auth.userId,
      bytes: avatarBuffer,
      mimeType: avatarImageFile.type || "image/jpeg",
      name: avatarImageFile.name || "avatar",
      sourceFeature: "ai-creator",
      sourceJobId: jobId,
    }).catch((e) => {
      logger.warn("ai-creator", "best-effort avatar asset adoption failed", { reason: (e as Error).message });
    });
  }

  const job: Job = {
    progress: 5,
    status: "processing",
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
    tempFiles,
    s3Keys: [],
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      // 1. Extract audio from the uploaded video, trimmed to the billed duration
      job.progress = 10;
      const audioPath = path.join(os.tmpdir(), `${jobId}-audio.mp3`);
      tempFiles.push(audioPath);
      try {
        await runFFmpegArgs([
          "-y", "-i", inputVideoPath,
          "-vn", "-acodec", "libmp3lame", "-q:a", "4",
          "-t", String(duration),
          audioPath,
        ]);
      } catch {
        // Video has no audio track — generate a silent mp3 matching the billed duration
        await runFFmpegArgs([
          "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
          "-t", String(duration), "-acodec", "libmp3lame", "-q:a", "9",
          audioPath,
        ]);
      }

      // 2. Upload audio to S3 and hand fal.ai a short-lived signed URL rather
      // than the permanent public one — this is a user's voice recording.
      job.progress = 25;
      const audioBuffer = fs.readFileSync(audioPath);
      const audioKey = `ai-creator/${jobId}/audio.mp3`;
      await uploadBufferToS3(audioBuffer, audioKey, "audio/mpeg");
      job.s3Keys.push(audioKey);
      const audioS3Url = await getPresignedUrl(audioKey, 3600);
      try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

      // 3. Resolve avatar image URL — same signed-URL treatment when it's a
      // user upload (a face photo); preset avatars are already public assets
      // we control, so they're used as-is.
      job.progress = 35;
      let avatarImageUrl: string;
      if (avatarType === "upload" && avatarImagePath) {
        const imgBuffer = fs.readFileSync(avatarImagePath);
        const imgExt = path.extname(avatarImagePath).replace(".", "") || "jpg";
        const avatarKey = `ai-creator/${jobId}/avatar.${imgExt}`;
        await uploadBufferToS3(imgBuffer, avatarKey, "image/jpeg");
        job.s3Keys.push(avatarKey);
        avatarImageUrl = await getPresignedUrl(avatarKey, 3600);
        try { fs.unlinkSync(avatarImagePath); } catch { /* ignore */ }
      } else {
        avatarImageUrl = PRESET_AVATAR_URLS[avatarType]!;
      }

      // 4. Submit to fal.ai SadTalker: source face image + driven audio → talking video
      job.progress = 40;
      const requestId = await falSubmit({
        source_image_url: avatarImageUrl,
        driven_audio_url: audioS3Url,
      });

      // 5. Poll until done (progress ticks 45 → 88 while waiting)
      job.progress = 45;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 10000);

      let videoUrl: string;
      try {
        videoUrl = await falPollUntilDone(requestId);
      } finally {
        clearInterval(progressTimer);
      }

      // fal.ai has now fetched both signed URLs — clean up the S3 objects,
      // whether or not the rest of the job succeeds.
      await deleteJobS3Objects(job);
      job.s3Keys = [];

      if ((job.status as string) === "cancelled") return;

      // 6. Download result and write to temp output file
      job.progress = 92;
      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error("Failed to download SadTalker output");
      fs.writeFileSync(outputPath, Buffer.from(await dlRes.arrayBuffer()));

      if (wasClampedByCeiling) {
        job.meta = { trimmedToSeconds: duration, sourceDurationSeconds: Math.round(effectiveDuration) };
      }
      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      await deleteJobS3Objects(job);
      job.s3Keys = [];
      if ((job.status as string) === "cancelled") return;
      logger.error("ai-creator", `job ${jobId} failed`, err);
      job.status = "error";
      job.error = err instanceof Error ? err.message : "AI Creator generation failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    } finally {
      for (const f of [inputVideoPath, avatarImagePath ?? ""]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:ai-creator" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:ai-creator:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:ai-creator:cancel" },
);
