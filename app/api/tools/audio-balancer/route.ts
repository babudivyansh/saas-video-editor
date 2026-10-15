import { NextRequest, NextResponse } from "next/server";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { freeToolGate } from "@/lib/free-tool-caps";
import { createJobStatusHandler } from "@/lib/job-routes";
import { resolveUploadPolicy, readUploadForm, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { saveMediaUpload } from "@/lib/media-upload";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const MODE_FILTERS: Record<string, string[]> = {
  "left-only": ["-af", "pan=stereo|c0=c0|c1=c0"],
  // EBU R128 loudness normalisation — shown as "Normalise loudness" in the UI.
  "balance-center": ["-af", "loudnorm=I=-23:TP=-2:LRA=7"],
  "right-only": ["-af", "pan=stereo|c0=c1|c1=c1"],
};

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPath: string;
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
}

const g = globalThis as unknown as { __audioJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__audioJobs ?? (g.__audioJobs = new Map());

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
  const gate = await freeToolGate(req, "audio-balancer");
  if (gate instanceof NextResponse) return gate;

  sweep();

  // Callable anonymously (only the /dashboard/tools/free/* pages are
  // login-gated). A session gets the caller's real plan cap, anyone else
  // ANONYMOUS_MAX_BYTES. Resolved BEFORE the body is read, so an oversized
  // upload is refused unparsed instead of after it is already held in memory.
  const policy = await resolveUploadPolicy(gate.auth?.userId ?? null, "audio-balancer");
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

  const mode = (formData.get("mode") as string | null) ?? "balance-center";
  const filterArgs = MODE_FILTERS[mode] ?? MODE_FILTERS["balance-center"];

  const jobId = randomUUID();
  const saved = await saveMediaUpload(file, jobId, "mp4");
  if (saved instanceof NextResponse) return saved;
  const { inputPath } = saved;
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `${file.name.replace(/\.[^.]+$/, "")}-balanced.mp3`;

  const job: Job = {
    progress: 0, status: "processing", inputPath, outputPath, downloadName, createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  runFFmpegWithProgress(
    ["-y", "-i", inputPath, ...filterArgs, "-acodec", "libmp3lame", "-q:a", "2", outputPath],
    (pct) => { job.progress = pct; },
  )
    .then(() => { job.progress = 100; job.status = "done"; })
    .catch((err) => {
      logger.error("audio-balancer", "job failed", err);
      job.status = "error";
      job.error = "We couldn't process this file. Make sure it has an audio track and try again.";
    })
    .finally(() => { try { fs.unlinkSync(inputPath); } catch {} });

  return NextResponse.json({ jobId }, { status: 202 });
}

async function handleGET(req: NextRequest) {
  const limit = await rateLimit(`audio-balancer:status:ip:${getClientIp(req)}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  return createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true, allowAnonymous: true })(req);
}

export const GET = handleGET;
