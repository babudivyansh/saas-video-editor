import { userMessage, rawErrorText } from "@/lib/user-facing-error";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { runFFmpegArgs, runFFmpegWithProgress, getMediaDimensions } from "@/utils/ffmpeg-render";
import { cropScaleFilter } from "@/lib/crop";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { localRenderCredits } from "@/lib/render-pricing";
import { withRateLimit } from "@/lib/with-rate-limit";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { saveMediaUpload } from "@/lib/media-upload";
import { saveToolResult } from "@/lib/tool-results";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// One export takes this many clips at most. The file loop below used to be
// unbounded: one 1-credit request could carry any number of plan-sized files,
// all held in memory and then re-encoded one after another.
const MAX_CLIPS = 5;
// Total length of the finished export.
const MAX_TOTAL_SEC = 10 * 60;

type CropAspect = "original" | "9:16" | "1:1" | "16:9";
type Rotation = 0 | 90 | 180 | 270;

interface Trim { start: number; end: number }

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  inputPaths: string[];
  trimmedPaths: string[];
  concatListPath: string;
  createdAt: number;
}

const g = globalThis as unknown as { __cutCropJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__cutCropJobs ?? (g.__cutCropJobs = new Map());

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - job.createdAt;
    // A still-processing job gets a longer runway (1hr, matching this app's
    // other long-running-job cutoffs) so sweep() never unlinks the files out
    // from under an export that's legitimately still working — only a truly
    // stuck job gets cleaned up, and only well past its normal lifetime.
    const stale = job.status === "processing" ? age > 60 * 60 * 1000 : age > 30 * 60 * 1000;
    if (stale) {
      cleanupJobFiles(job);
      jobs.delete(id);
    }
  }
}

function cleanupJobFiles(job: Job) {
  for (const f of [...job.inputPaths, ...job.trimmedPaths, job.concatListPath, job.outputPath]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

// The per-clip video filter applied during the trim stage (not at concat
// time) — this is what actually makes the concat demuxer safe: every
// trimmed segment ends up at the same resolution before concatenation,
// rather than concatenating mismatched sources and only cropping afterward
// (which can produce an invalid stream, or — for 9:16/1:1/16:9 — request a
// crop rectangle larger than the source frame and crash ffmpeg entirely for
// portrait or ultrawide sources). `cropScaleFilter` is the already-safe,
// already-shared helper used by the client preview's own math (lib/crop.ts);
// it was written for exactly this but was never actually wired in here.
async function resolveClipFilter(crop: CropAspect, inputPaths: string[]): Promise<string> {
  if (crop !== "original") return cropScaleFilter(crop);
  if (inputPaths.length <= 1) return cropScaleFilter("original");

  const dims = await Promise.all(inputPaths.map((p) => getMediaDimensions(p)));
  const [first, ...rest] = dims;
  const allSame = first.w > 0 && rest.every((d) => d.w === first.w && d.h === first.h);
  if (allSame) return cropScaleFilter("original");

  // No crop chosen, but the source clips have different resolutions —
  // letterbox every clip to the first clip's resolution so the concat
  // demuxer (which requires uniform streams) doesn't fail or corrupt output.
  return `scale=${first.w}:${first.h}:force_original_aspect_ratio=decrease,pad=${first.w}:${first.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}

// Rotation/flip are applied after crop/scale — ffmpeg's `transpose` filter
// handles 90°/270° (which also swaps width/height), two `transpose`s make
// 180°, and `hflip` mirrors horizontally.
function rotateFlipFilter(rotation: Rotation, flipH: boolean): string {
  const parts: string[] = [];
  if (rotation === 90) parts.push("transpose=1");
  else if (rotation === 180) parts.push("transpose=1", "transpose=1");
  else if (rotation === 270) parts.push("transpose=2");
  if (flipH) parts.push("hflip");
  return parts.join(",");
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await resolveUploadPolicy(auth.userId, "cut-and-crop");
  const formData = await readUploadForm(req, policy, MAX_CLIPS);
  if (formData instanceof NextResponse) return formData;

  // Parse trims and crop. Each trim must be a pair of finite numbers — a bad
  // entry used to throw inside the job, after the charge.
  let trims: Trim[];
  try {
    const parsed: unknown = JSON.parse((formData.get("trims") as string) ?? "[]");
    if (!Array.isArray(parsed) || !parsed.every((t) =>
      t && typeof t === "object" && Number.isFinite((t as Trim).start) && Number.isFinite((t as Trim).end))) {
      throw new Error("bad trims");
    }
    trims = parsed as Trim[];
  } catch {
    return NextResponse.json({ error: "Invalid trims" }, { status: 400 });
  }
  const crop = ((formData.get("crop") as string) ?? "original") as CropAspect;
  if (!["original", "9:16", "1:1", "16:9"].includes(crop)) {
    return NextResponse.json({ error: "Invalid crop aspect" }, { status: 400 });
  }
  const rotationRaw = Number(formData.get("rotation") ?? 0);
  const rotation: Rotation = ([0, 90, 180, 270] as const).includes(rotationRaw as Rotation) ? (rotationRaw as Rotation) : 0;
  const flipH = (formData.get("flipH") as string | null) === "true";

  // Collect files
  const files: File[] = [];
  for (let i = 0; ; i++) {
    const f = formData.get(`file_${i}`) as File | null;
    if (!f) break;
    files.push(f);
  }
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });
  if (files.length > MAX_CLIPS) {
    return NextResponse.json({ error: `You can add up to ${MAX_CLIPS} clips per export.` }, { status: 400 });
  }
  if (files.length !== trims.length) {
    return NextResponse.json({ error: "Trims/files count mismatch" }, { status: 400 });
  }

  for (const f of files) {
    try {
      assertWithinUploadPolicy(policy, f.size);
    } catch (e) {
      if (e instanceof UploadPolicyError) {
        return NextResponse.json(
          { ...uploadPolicyErrorBody(e, policy), error: `File ${f.name}: ${e.message}` },
          { status: uploadPolicyErrorStatus(e.limitingFactor) },
        );
      }
      throw e;
    }
  }

  // Save and check every clip BEFORE charging: safe temp extensions, a real
  // media container (lib/media-upload.ts), and the total output length.
  const jobId = randomUUID();
  const inputPaths: string[] = [];
  const trimmedPaths: string[] = [];
  const discardInputs = () => { for (const p of inputPaths) { try { fs.unlinkSync(p); } catch { /* ignore */ } } };
  let totalSec = 0;
  for (let i = 0; i < files.length; i++) {
    const saved = await saveMediaUpload(files[i], jobId, "mp4", `in-${i}`);
    if (saved instanceof NextResponse) { discardInputs(); return saved; }
    inputPaths.push(saved.inputPath);
    trimmedPaths.push(path.join(os.tmpdir(), `${jobId}-trim-${i}.mp4`));
    const start = Math.max(0, trims[i].start);
    const end = saved.durationSec > 0 ? Math.min(trims[i].end, saved.durationSec) : trims[i].end;
    totalSec += Math.max(0.1, end - start);
  }
  if (totalSec > MAX_TOTAL_SEC) {
    discardInputs();
    return NextResponse.json({ error: `The finished video can be up to ${MAX_TOTAL_SEC / 60} minutes long. Trim your clips and try again.` }, { status: 400 });
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  // Free on a paid plan up to the daily render allowance (lib/render-pricing.ts).
  const creditCost = await localRenderCredits(auth.userId, await getUserTier(auth.userId));
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: creditCost,
    toolSlug: "cut-and-crop",
    idempotencyKey,
    log: { generationType: "video" },
  });
  const replayed = idempotencyResponse(charge, jobs);
  if (replayed) { discardInputs(); return replayed; }
  if (!charge.ok) {
    discardInputs();
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Cut & Crop is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const concatListPath = path.join(os.tmpdir(), `${jobId}-concat.txt`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `cut-and-crop-${Date.now()}.mp4`;

  const job: Job = {
    progress: 0,
    status: "processing",
    inputPaths,
    trimmedPaths,
    concatListPath,
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  // Background work
  (async () => {
    try {
      const cropFilter = await resolveClipFilter(crop, inputPaths);
      const rfFilter = rotateFlipFilter(rotation, flipH);
      const clipFilter = [cropFilter, rfFilter].filter(Boolean).join(",");

      // Stage 1: trim each clip (re-encode so concat is safe across mixed
      // codecs), applying the crop/scale/letterbox filter here — not after
      // concat — so every trimmed segment already shares one resolution.
      // Using -c copy with -ss can fail if the cut point isn't at a keyframe.
      for (let i = 0; i < inputPaths.length; i++) {
        if ((job.status as string) === "cancelled") return;
        const { start, end } = trims[i];
        const s = Math.max(0, Number(start) || 0);
        const e = Math.max(s + 0.1, Number(end) || s + 0.1);
        await runFFmpegArgs([
          "-y",
          "-ss", String(s),
          "-to", String(e),
          "-i", inputPaths[i],
          "-vf", clipFilter,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart",
          trimmedPaths[i],
        ]);
        // First half of the progress is trim
        job.progress = Math.round(((i + 1) / inputPaths.length) * 40);
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }

      // Cancellation checkpoint between stages — skip the concat pass
      // entirely if the user already cancelled.
      if ((job.status as string) === "cancelled") return;

      // Stage 2: concat only — every trimmed clip already shares the same
      // resolution/codec from stage 1, so this can always stream-copy
      // (faster, and no longer needs its own crop branch).
      const listContent = trimmedPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
      fs.writeFileSync(concatListPath, listContent, "utf8");

      const concatArgs: string[] = [
        "-y",
        "-f", "concat", "-safe", "0",
        "-i", concatListPath,
        "-c", "copy",
        "-movflags", "+faststart",
        outputPath,
      ];

      await runFFmpegWithProgress(concatArgs, (pct) => {
        // Map ffmpeg's 0-99 over the second 60% of overall progress
        job.progress = 40 + Math.round((pct / 100) * 59);
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      });

      if ((job.status as string) === "cancelled") return;

      // Kept in the user's Assets and on the Generation, so a failed or
      // interrupted browser download no longer loses a paid export.
      await saveToolResult({ userId: job.userId, generationId: job.generationId, toolSlug: "cut-and-crop", source: { filePath: outputPath }, mimeType: "video/mp4", name: downloadName });

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      logger.error("cut-and-crop", "job failed", err);
      job.error = userMessage(err, "We couldn't export this video. Your credit was refunded — check the clips and try again.");
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", rawErrorText(err));
        } catch { /* swallow */ }
      }
    } finally {
      // Inputs and trims are no longer needed; output is kept until download.
      for (const f of [...inputPaths, ...trimmedPaths, concatListPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "tools:cut-and-crop" });

export const GET = withRateLimit(
  // Not deleted on download: a retry after a dropped download must still work.
  // sweep() reclaims the file after 30 minutes; the copy in Assets stays.
  createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: false }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "tools:cut-and-crop:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:cut-and-crop:cancel" },
);
