import { NextRequest, NextResponse } from "next/server";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { freeToolGate } from "@/lib/free-tool-caps";
import { createJobStatusHandler } from "@/lib/job-routes";
import { createRenderQueue } from "@/lib/render-queue";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { saveMediaUpload } from "@/lib/media-upload";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// Compression strength → x264 CRF. Higher CRF = smaller file, lower quality.
// The UI shows these as a "Smaller file ↔ Better quality" scale.
const QUALITY_CRF: Record<string, string> = {
  maximum: "36",
  high: "32",
  medium: "28",
  low: "24",
  minimal: "20",
};

const RESOLUTION_H: Record<string, number> = { "1080p": 1080, "720p": 720, "480p": 480, "360p": 360, "240p": 240 };

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPath: string;
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
}

const g = globalThis as unknown as { __videoJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__videoJobs ?? (g.__videoJobs = new Map());

interface CompressPayload {
  // createRenderQueue requires a `projectId` field for its own (separate,
  // Redis-backed) progress tracking — this route's actual status/download
  // polling reads the `jobs` Map above via createJobStatusHandler instead,
  // so this is just satisfying that shape with our own jobId.
  projectId: string;
  inputPath: string;
  outputPath: string;
  crf: string;
  scaleArgs: string[];
}

// Runs on the shared render queue, which caps how many compressions run at
// once (RENDER_CONCURRENCY) and retries a failed attempt. It does NOT make a
// job survive a restart: the `jobs` Map is in memory, so after a restart a
// re-delivered payload finds no entry and the handler returns without work.
const compressQueue = createRenderQueue<CompressPayload>("video-compressor", async (payload) => {
  const job = jobs.get(payload.projectId);
  if (!job) return; // job entry swept or lost to a restart — nothing to update
  try {
    // `-2` keeps the width even (x264 requires it) and the aspect ratio intact;
    // min() never upscales a source that is already smaller than the target.
    await runFFmpegWithProgress(
      ["-y", "-i", payload.inputPath, ...payload.scaleArgs, "-c:v", "libx264", "-crf", payload.crf, "-preset", "fast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", payload.outputPath],
      (pct) => { job.progress = pct; },
    );
    job.progress = 100;
    job.status = "done";
  } catch (err) {
    logger.error("video-compressor", "job failed", err);
    job.status = "error";
    job.error = "We couldn't compress this video. Make sure it plays, then try again.";
    throw err; // let the queue's retry/backoff decide whether to try again
  }
  // Input file cleanup deliberately NOT done here: the queue retries this same
  // handler on failure, and deleting the input after attempt 1 would make the
  // retries fail on a missing file. sweep() reclaims both paths after 30 min.
});

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) { try { fs.unlinkSync(f); } catch {} }
      jobs.delete(id);
    }
  }
}

export async function POST(req: NextRequest) {
  // Kill switch, then per-user (or anonymous per-IP) caps.
  const gate = await freeToolGate(req, "video-compressor");
  if (gate instanceof NextResponse) return gate;

  sweep();

  // Callable anonymously (only the /dashboard/tools/free/* pages are
  // login-gated). A session gets the caller's real plan cap, anyone else
  // ANONYMOUS_MAX_BYTES. Resolved BEFORE the body is read, so an oversized
  // upload is refused unparsed instead of after it is already held in memory.
  const policy = await resolveUploadPolicy(gate.auth?.userId ?? null, "video-compressor");
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

  const quality = (formData.get("quality") as string | null) ?? "medium";
  const crf = QUALITY_CRF[quality] ?? "28";

  const resolution = (formData.get("resolution") as string | null) ?? "original";
  const targetH = RESOLUTION_H[resolution] ?? null;
  const scaleArgs = targetH ? ["-vf", `scale=-2:'min(${targetH},ih)'`] : [];

  const jobId = randomUUID();
  const saved = await saveMediaUpload(file, jobId, "mp4");
  if (saved instanceof NextResponse) return saved;
  const { inputPath } = saved;
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `${file.name.replace(/\.[^.]+$/, "")}-compressed.mp4`;

  const job: Job = {
    progress: 0, status: "processing", inputPath, outputPath, downloadName, createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  compressQueue.enqueue(jobId, { projectId: jobId, inputPath, outputPath, crf, scaleArgs });

  return NextResponse.json({ jobId }, { status: 202 });
}

async function handleGET(req: NextRequest) {
  const limit = await rateLimit(`video-compressor:status:ip:${getClientIp(req)}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  return createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true, allowAnonymous: true })(req);
}

export const GET = handleGET;
