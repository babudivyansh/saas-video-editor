import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const CREDIT_COST = 1;

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPath: string;
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
}

const g = globalThis as unknown as { __subtitleRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__subtitleRemoverJobs ?? (g.__subtitleRemoverJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
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

export async function POST(req: NextRequest) {
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

  const videoFile = formData.get("video") as File | null;
  if (!videoFile) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

  const MAX_BYTES = 500 * 1024 * 1024;
  if (videoFile.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
  }

  // Deduct credit
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

  const jobId = randomUUID();
  const inputExt = (videoFile.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `subtitle-removed-${Date.now()}.mp4`;

  fs.writeFileSync(inputPath, Buffer.from(await videoFile.arrayBuffer()));

  const job: Job = {
    progress: 5,
    status: "processing",
    inputPath,
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress = 10;
      await runFFmpegWithProgress(
        [
          "-y", "-i", inputPath,
          "-vf", "delogo=x=0:y=ih*0.80:w=iw:h=ih*0.20:show=0",
          "-c:v", "libx264", "-preset", "fast", "-crf", "22",
          "-c:a", "copy",
          outputPath,
        ],
        (pct) => { job.progress = Math.max(10, Math.round(pct)); },
      );
      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Subtitle removal failed";
      if (!job.refunded) {
        job.refunded = true;
        try { await refundCredit(job.userId); } catch { /* swallow */ }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
  })();

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
