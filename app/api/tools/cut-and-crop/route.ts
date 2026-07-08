import { NextRequest, NextResponse } from "next/server";
import { runFFmpegArgs, runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const CREDIT_COST = 1;

type CropAspect = "original" | "9:16" | "1:1" | "16:9";

const CROP_FILTERS: Record<Exclude<CropAspect, "original">, string> = {
  "9:16": "crop=in_h*9/16:in_h",
  "1:1": "crop=in_h:in_h",
  "16:9": "crop=in_w:in_w*9/16",
};

interface Trim { start: number; end: number }

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPaths: string[];
  trimmedPaths: string[];
  concatListPath: string;
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
}

const g = globalThis as unknown as { __cutCropJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__cutCropJobs ?? (g.__cutCropJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
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

async function refundCredit(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: CREDIT_COST } },
  });
  const cached = await redis.get(`credits:${userId}`);
  if (cached !== null) {
    await redis.set(`credits:${userId}`, String(parseInt(cached, 10) + CREDIT_COST), "EX", 3600);
  }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

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

  // Deduct credit before kicking off the FFmpeg job
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

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
  };
  jobs.set(jobId, job);

  // Background work
  (async () => {
    try {
      // Stage 1: trim each clip (re-encode so concat is safe across mixed codecs).
      // Using -c copy with -ss can fail if the cut point isn't at a keyframe.
      for (let i = 0; i < inputPaths.length; i++) {
        const { start, end } = trims[i];
        const s = Math.max(0, Number(start) || 0);
        const e = Math.max(s + 0.1, Number(end) || s + 0.1);
        await runFFmpegArgs([
          "-y",
          "-ss", String(s),
          "-to", String(e),
          "-i", inputPaths[i],
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart",
          trimmedPaths[i],
        ]);
        // First half of the progress is trim
        job.progress = Math.round(((i + 1) / inputPaths.length) * 40);
      }

      // Stage 2: concat (+ optional crop)
      const listContent = trimmedPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
      fs.writeFileSync(concatListPath, listContent, "utf8");

      const concatArgs: string[] = [
        "-y",
        "-f", "concat", "-safe", "0",
        "-i", concatListPath,
      ];
      if (crop !== "original") {
        concatArgs.push("-vf", CROP_FILTERS[crop]);
        concatArgs.push("-c:v", "libx264", "-preset", "fast", "-crf", "23");
        concatArgs.push("-c:a", "aac", "-b:a", "128k");
      } else {
        concatArgs.push("-c", "copy");
      }
      concatArgs.push("-movflags", "+faststart");
      concatArgs.push(outputPath);

      await runFFmpegWithProgress(concatArgs, (pct) => {
        // Map ffmpeg's 0-99 over the second 60% of overall progress
        job.progress = 40 + Math.round((pct / 100) * 59);
      });

      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Export failed";
      if (!job.refunded) {
        job.refunded = true;
        try { await refundCredit(job.userId); } catch { /* swallow */ }
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

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const download = req.nextUrl.searchParams.get("download");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (download) {
    if (job.status !== "done") return NextResponse.json({ error: "Not ready" }, { status: 409 });
    const buffer = fs.readFileSync(job.outputPath);
    try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
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
