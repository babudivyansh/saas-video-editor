import { NextRequest, NextResponse } from "next/server";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createJobStatusHandler } from "@/lib/job-routes";
import { createRenderQueue } from "@/lib/render-queue";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const QUALITY_CRF: Record<string, string> = {
  maximum: "36",
  high: "32",
  medium: "28",
  low: "24",
  minimal: "20",
};

const RESOLUTION_H: Record<string, number> = { "360p": 360, "240p": 240 };

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

// Was a bare fire-and-forget promise chain mutating `jobs` directly — moved
// onto the shared BullMQ-backed queue so a compression job survives a server
// restart and gets automatic retry/backoff on failure, instead of silently
// vanishing (the in-memory Map lost all state on restart, and a mid-render
// crash just left the job stuck at whatever progress it last reported).
// Deliberately NOT changed: the `jobs` Map, `Job` shape, and
// createJobStatusHandler below are untouched, so status/download polling and
// ownership checks behave exactly as before.
const compressQueue = createRenderQueue<CompressPayload>("video-compressor", async (payload) => {
  const job = jobs.get(payload.projectId);
  if (!job) return; // job entry already swept — nothing to update
  try {
    await runFFmpegWithProgress(
      ["-y", "-i", payload.inputPath, ...payload.scaleArgs, "-c:v", "libx264", "-crf", payload.crf, "-preset", "fast", "-c:a", "aac", "-b:a", "128k", payload.outputPath],
      (pct) => { job.progress = pct; },
    );
    job.progress = 100;
    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : "Compression failed";
    throw err; // let BullMQ's retry/backoff decide whether to try again
  }
  // Input file cleanup deliberately NOT done here: BullMQ retries this same
  // handler up to 3x on failure, and deleting the input after attempt 1
  // would make attempts 2-3 fail on a missing file instead of actually
  // retrying the compression. The existing sweep() below already reclaims
  // both input and output paths after 30 minutes regardless of outcome.
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
  const limit = await rateLimit(`video-compressor:ip:${getClientIp(req)}`, 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  sweep();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const MAX_BYTES = 500 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
  }

  const quality = (formData.get("quality") as string | null) ?? "medium";
  const crf = QUALITY_CRF[quality] ?? "28";

  const resolution = (formData.get("resolution") as string | null) ?? "original";
  const targetH = RESOLUTION_H[resolution] ?? null;
  const scaleArgs = targetH ? ["-vf", `scale=-2:${targetH}`] : [];

  const jobId = randomUUID();
  const inputExt = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `${file.name.replace(/\.[^.]+$/, "")}-compressed.mp4`;

  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

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
