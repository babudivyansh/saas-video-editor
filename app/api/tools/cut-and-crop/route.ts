import { NextRequest, NextResponse } from "next/server";
import { runFFmpegArgs, runFFmpegWithProgress, getMediaDimensions } from "@/utils/ffmpeg-render";
import { cropScaleFilter } from "@/lib/crop";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const CREDIT_COST = 1;

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  // Parse trims and crop
  let trims: Trim[];
  try {
    trims = JSON.parse((formData.get("trims") as string) ?? "[]");
  } catch {
    return NextResponse.json({ error: "Invalid trims JSON" }, { status: 400 });
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
  if (files.length !== trims.length) {
    return NextResponse.json({ error: "Trims/files count mismatch" }, { status: 400 });
  }

  const MAX_BYTES = 500 * 1024 * 1024;
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: `File ${f.name} exceeds 500 MB` }, { status: 413 });
    }
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "cut-and-crop",
    idempotencyKey,
    log: { generationType: "video" },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Cut & Crop is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // Write input files to tmp
  const jobId = randomUUID();
  const inputPaths: string[] = [];
  const trimmedPaths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const ext = (files[i].name.split(".").pop() ?? "mp4").toLowerCase();
    const ip = path.join(os.tmpdir(), `${jobId}-in-${i}.${ext}`);
    fs.writeFileSync(ip, Buffer.from(await files[i].arrayBuffer()));
    inputPaths.push(ip);
    trimmedPaths.push(path.join(os.tmpdir(), `${jobId}-trim-${i}.mp4`));
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
    creditCost: CREDIT_COST,
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

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Export failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
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
  createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:cut-and-crop:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:cut-and-crop:cancel" },
);
