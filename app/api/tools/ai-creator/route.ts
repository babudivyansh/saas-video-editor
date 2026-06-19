import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { uploadFileToS3, uploadBufferToS3 } from "@/utils/s3-upload";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { attachmentDisposition } from "@/utils/content-disposition";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const CREDIT_COST = 2;

const PRESET_AVATARS: Record<string, string> = {
  "nano-banana": process.env.HEYGEN_AVATAR_NANO_BANANA ?? "Abigail_expressive_20240906",
  "face-swap":   process.env.HEYGEN_AVATAR_FACE_SWAP   ?? "Anna_public_3_20240108",
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

async function heygenGenerate(
  avatarId: string,
  avatarType: "avatar" | "talking_photo",
  audioUrl: string,
  videoUrl: string,
): Promise<string> {
  const character =
    avatarType === "talking_photo"
      ? { type: "talking_photo", talking_photo_id: avatarId }
      : { type: "avatar", avatar_id: avatarId, avatar_style: "normal" };

  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: {
      "x-api-key": process.env.HEYGEN_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [{
        character,
        voice: { type: "audio", audio_url: audioUrl },
        background: { type: "video", url: videoUrl },
      }],
      dimension: { width: 1080, height: 1920 },
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `HeyGen generate error ${res.status}`);
  }
  return data.data.video_id as string;
}

async function heygenPollUntilDone(videoId: string): Promise<string> {
  const deadline = Date.now() + 10 * 60 * 1000; // 10-minute timeout
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      { headers: { "x-api-key": process.env.HEYGEN_API_KEY! } },
    );
    const data = await res.json();
    const status = data.data?.status as string;
    if (status === "completed") return data.data.video_url as string;
    if (status === "failed") throw new Error(data.data?.error ?? "HeyGen generation failed");
  }
  throw new Error("HeyGen generation timed out after 10 minutes");
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
  if (!videoFile) return NextResponse.json({ error: "No video provided" }, { status: 400 });

  const MAX_VIDEO = 200 * 1024 * 1024;
  if (videoFile.size > MAX_VIDEO) {
    return NextResponse.json({ error: "Video too large (max 200 MB)" }, { status: 413 });
  }

  const avatarType = (formData.get("avatarType") as string | null) ?? "nano-banana";
  const avatarImageFile = formData.get("avatarImage") as File | null;
  const voiceChoice = (formData.get("voiceChoice") as string | null) ?? "original";

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

  fs.writeFileSync(inputVideoPath, Buffer.from(await videoFile.arrayBuffer()));

  const tempFiles: string[] = [inputVideoPath, outputPath];

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
      // 1. Upload video to S3 (HeyGen needs a public URL)
      job.progress = 10;
      const videoS3Key = `ai-creator/${jobId}/video.${videoExt}`;
      const videoS3Url = await uploadFileToS3(inputVideoPath, videoS3Key, "video/mp4");

      // 2. Extract audio from video
      job.progress = 20;
      const audioPath = path.join(os.tmpdir(), `${jobId}-audio.mp3`);
      tempFiles.push(audioPath);
      await runFFmpegArgs([
        "-y", "-i", inputVideoPath,
        "-vn", "-acodec", "libmp3lame", "-q:a", "4",
        audioPath,
      ]);

      // 3. Upload audio to S3
      job.progress = 30;
      const audioBuffer = fs.readFileSync(audioPath);
      const audioS3Url = await uploadBufferToS3(audioBuffer, `ai-creator/${jobId}/audio.mp3`, "audio/mpeg");
      try { fs.unlinkSync(audioPath); } catch { /* ignore */ }

      // 4. Resolve avatar
      job.progress = 35;
      let resolvedAvatarId: string;
      let resolvedAvatarKind: "avatar" | "talking_photo" = "avatar";

      if (avatarType === "upload" && avatarImagePath) {
        // Upload image to S3, then register as HeyGen talking photo
        const imgBuffer = fs.readFileSync(avatarImagePath);
        const imgExt = path.extname(avatarImagePath).replace(".", "") || "jpg";
        const imgUrl = await uploadBufferToS3(imgBuffer, `ai-creator/${jobId}/avatar.${imgExt}`, "image/jpeg");

        const tpRes = await fetch("https://api.heygen.com/v1/talking_photo", {
          method: "POST",
          headers: { "x-api-key": process.env.HEYGEN_API_KEY!, "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imgUrl }),
        });
        const tpData = await tpRes.json();
        if (!tpRes.ok || tpData.error) throw new Error(tpData.error?.message ?? "Failed to create talking photo");
        resolvedAvatarId = tpData.data.talking_photo_id as string;
        resolvedAvatarKind = "talking_photo";
      } else {
        resolvedAvatarId = PRESET_AVATARS[avatarType] ?? PRESET_AVATARS["nano-banana"];
      }

      // 5. Submit to HeyGen
      job.progress = 40;
      const heygenVideoId = await heygenGenerate(resolvedAvatarId, resolvedAvatarKind, audioS3Url, videoS3Url);

      // 6. Poll HeyGen (progress 40→90 during this wait)
      job.progress = 45;
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 10000);

      let heygenVideoUrl: string;
      try {
        heygenVideoUrl = await heygenPollUntilDone(heygenVideoId);
      } finally {
        clearInterval(progressTimer);
      }

      // 7. Download result from HeyGen and write to output file
      job.progress = 92;
      const dlRes = await fetch(heygenVideoUrl);
      if (!dlRes.ok) throw new Error("Failed to download HeyGen output");
      const outputBuffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, outputBuffer);

      job.progress = 100;
      job.status = "done";
    } catch (err) {
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
