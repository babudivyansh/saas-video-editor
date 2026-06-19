import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { resolveVoiceId } from "@/utils/voice-ids";
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

const g = globalThis as unknown as { __voiceChangerJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__voiceChangerJobs ?? (g.__voiceChangerJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      cleanupJob(job);
      jobs.delete(id);
    }
  }
}

function cleanupJob(job: Job) {
  for (const f of [job.inputPath, job.outputPath]) {
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

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) return NextResponse.json({ error: "No audio file provided" }, { status: 400 });

  const MAX_BYTES = 50 * 1024 * 1024;
  if (audioFile.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
  }

  const voiceSlug = (formData.get("voiceSlug") as string | null) ?? "adam";
  const removeNoise = (formData.get("removeNoise") as string | null) === "true";

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
  const ext = (audioFile.name.split(".").pop() ?? "mp3").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${ext}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `voice-changed-${Date.now()}.mp3`;

  fs.writeFileSync(inputPath, Buffer.from(await audioFile.arrayBuffer()));

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
      const voiceId = resolveVoiceId(voiceSlug);

      job.progress = 10;

      const elForm = new FormData();
      const inputBlob = new Blob([fs.readFileSync(inputPath)], { type: audioFile.type || "audio/mpeg" });
      elForm.append("audio", inputBlob, audioFile.name);
      elForm.append("model_id", "eleven_multilingual_sts_v2");
      elForm.append("voice_settings", JSON.stringify({ stability: 0.5, similarity_boost: 0.75 }));
      elForm.append("remove_background_noise", String(removeNoise));

      job.progress = 20;

      const res = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        body: elForm,
      });

      job.progress = 60;

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      job.progress = 95;

      fs.writeFileSync(outputPath, audioBuffer);
      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Voice change failed";
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
        "Content-Type": "audio/mpeg",
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
