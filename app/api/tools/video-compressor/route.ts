import { NextRequest, NextResponse } from "next/server";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
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

  runFFmpegWithProgress(
    ["-y", "-i", inputPath, ...scaleArgs, "-c:v", "libx264", "-crf", crf, "-preset", "fast", "-c:a", "aac", "-b:a", "128k", outputPath],
    (pct) => { job.progress = pct; },
  )
    .then(() => { job.progress = 100; job.status = "done"; })
    .catch((err) => { job.status = "error"; job.error = err instanceof Error ? err.message : "Compression failed"; })
    .finally(() => { try { fs.unlinkSync(inputPath); } catch {} });

  return NextResponse.json({ jobId }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const download = req.nextUrl.searchParams.get("download");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (download) {
    if (job.status !== "done") return NextResponse.json({ error: "Not ready" }, { status: 409 });
    const buffer = fs.readFileSync(job.outputPath);
    try { fs.unlinkSync(job.outputPath); } catch {}
    jobs.delete(jobId);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": attachmentDisposition(job.downloadName),
        "Content-Length": String(buffer.length),
      },
    });
  }

  return NextResponse.json({
    progress: Math.round(job.progress),
    status: job.status,
    error: job.error,
  });
}
