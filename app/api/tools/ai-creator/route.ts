import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const CREDIT_COST = 2;

// Optional preset face images — set these in .env as public S3 URLs.
// If not configured, those preset options return a clear error asking the user
// to upload their own face image instead.
const PRESET_AVATAR_URLS: Record<string, string | undefined> = {
  "nano-banana": env.PRESET_AVATAR_NANO_BANANA_URL,
  "face-swap":   env.PRESET_AVATAR_FACE_SWAP_URL,
};

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
  tempFiles: string[];
}

const g = globalThis as unknown as { __aiCreatorJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__aiCreatorJobs ?? (g.__aiCreatorJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of job.tempFiles) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
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
  if (!videoFile) return NextResponse.json({ error: "No video provided" }, { status: 400 });

  const MAX_VIDEO = 200 * 1024 * 1024;
  if (videoFile.size > MAX_VIDEO) {
    return NextResponse.json({ error: "Video too large (max 200 MB)" }, { status: 413 });
  }

  const avatarType = (formData.get("avatarType") as string | null) ?? "upload";
  const avatarImageFile = formData.get("avatarImage") as File | null;

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

  // Deduct credits
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
  const videoExt = (videoFile.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputVideoPath = path.join(os.tmpdir(), `${jobId}-video.${videoExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `ai-creator-${Date.now()}.mp4`;
  const tempFiles: string[] = [inputVideoPath, outputPath];

  fs.writeFileSync(inputVideoPath, Buffer.from(await videoFile.arrayBuffer()));

  let avatarImagePath: string | null = null;
  if (avatarType === "upload" && avatarImageFile) {
    const imgExt = (avatarImageFile.name.split(".").pop() ?? "jpg").toLowerCase();
    avatarImagePath = path.join(os.tmpdir(), `${jobId}-avatar.${imgExt}`);
    fs.writeFileSync(avatarImagePath, Buffer.from(await avatarImageFile.arrayBuffer()));
    tempFiles.push(avatarImagePath);
  }

  const job: Job = {
    progress: 5,
    status: "processing",
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    tempFiles,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      // 1. Extract audio from the uploaded video
      job.progress = 10;
      const audioPath = path.join(os.tmpdir(), `${jobId}-audio.mp3`);
      tempFiles.push(audioPath);
      try {
        await runFFmpegArgs([
          "-y", "-i", inputVideoPath,
          "-vn", "-acodec", "libmp3lame", "-q:a", "4",
          audioPath,
        ]);
      } catch {
        // Video has no audio track — generate 1-second silent mp3 so SadTalker still works
        await runFFmpegArgs([
          "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
          "-t", "1", "-acodec", "libmp3lame", "-q:a", "9",
          audioPath,
        ]);
      }

      // 2. Upload audio to S3 — fal.ai requires a public URL
      job.progress = 25;
      const audioBuffer = fs.readFileSync(audioPath);
      const audioS3Url = await uploadBufferToS3(
        audioBuffer,
        `ai-creator/${jobId}/audio.mp3`,
        "audio/mpeg",
      );
      try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

      // 3. Resolve avatar image URL
      job.progress = 35;
      let avatarImageUrl: string;
      if (avatarType === "upload" && avatarImagePath) {
        const imgBuffer = fs.readFileSync(avatarImagePath);
        const imgExt = path.extname(avatarImagePath).replace(".", "") || "jpg";
        avatarImageUrl = await uploadBufferToS3(
          imgBuffer,
          `ai-creator/${jobId}/avatar.${imgExt}`,
          "image/jpeg",
        );
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
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 10000);

      let videoUrl: string;
      try {
        videoUrl = await falPollUntilDone(requestId);
      } finally {
        clearInterval(progressTimer);
      }

      // 6. Download result and write to temp output file
      job.progress = 92;
      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error("Failed to download SadTalker output");
      fs.writeFileSync(outputPath, Buffer.from(await dlRes.arrayBuffer()));

      job.progress = 100;
      job.status = "done";
    } catch (err) {
      logger.error("ai-creator", `job ${jobId} failed`, err);
      job.status = "error";
      job.error = err instanceof Error ? err.message : "AI Creator generation failed";
      if (!job.refunded) {
        job.refunded = true;
        try { await refundCredit(job.userId); } catch { /* swallow */ }
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
