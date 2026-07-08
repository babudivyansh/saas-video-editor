import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { attachmentDisposition } from "@/utils/content-disposition";
import { getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// fal.ai Demucs bills $0.0007/s of processing time. Cheap per second, but the
// route only capped file size (50MB) with no duration limit — a long,
// low-bitrate file could slip through uncapped. Cap input length so the
// worst case (~₹20 at 5 min) stays under 3 credits' revenue even at the
// cheapest per-credit plan (Studio Yearly, ~₹9.41/credit = ~₹28.2).
const CREDIT_COST = 3;
const MAX_DURATION_SEC = 300; // 5 minutes
const FAL_MODEL = "fal-ai/demucs";

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

const g = globalThis as unknown as { __vocalRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__vocalRemoverJobs ?? (g.__vocalRemoverJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
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

function falAuth() {
  return { Authorization: `Key ${env.FAL_KEY}` };
}

async function uploadToFal(buffer: Buffer, mimeType: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch("https://storage.fal.run", {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": mimeType },
      body: new Uint8Array(buffer),
      signal,
    }),
    { timeoutMs: 30_000 },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai storage upload failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return (data.url ?? data.access_url) as string;
}

async function falSubmit(audioUrl: string): Promise<string> {
  const res = await withRetry(
    (signal) => fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: { ...falAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, stems: "2stems" }),
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
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: falAuth() },
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: falAuth() },
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const url =
        result?.stems?.accompaniment?.url ??
        result?.accompaniment?.url ??
        result?.no_vocals?.url ??
        (result?.audio_url as string | undefined);
      if (!url) throw new Error("No accompaniment URL in fal.ai result");
      return url;
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "fal.ai separation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("fal.ai vocal removal timed out after 10 minutes");
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Vocal removal is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
  }

  const jobId = randomUUID();
  const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${ext}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `instrumental-${file.name.replace(/\.[^.]+$/, "")}.mp3`;

  // Write to disk first so we can probe duration BEFORE charging.
  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

  const durationSec = await getMediaDurationSec(inputPath);
  if (durationSec > MAX_DURATION_SEC) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return NextResponse.json(
      { error: `Audio is too long (${Math.round(durationSec)}s). Max is ${MAX_DURATION_SEC / 60} minutes.` },
      { status: 400 },
    );
  }

  // Deduct credits
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

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

      // Upload file to fal.ai storage
      const fileBuffer = fs.readFileSync(inputPath);
      const mimeType = file.type || "audio/mpeg";
      const falUrl = await uploadToFal(fileBuffer, mimeType);
      job.progress = 15;

      // Submit to Demucs queue
      const requestId = await falSubmit(falUrl);
      job.progress = 20;

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 8000);

      let resultUrl: string;
      try {
        resultUrl = await falPollUntilDone(requestId);
      } finally {
        clearInterval(progressTimer);
      }

      job.progress = 90;

      // Download the instrumental track
      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) throw new Error("Failed to download result from fal.ai");
      const audioBuffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, audioBuffer);

      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Vocal removal failed";
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

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:vocal-remover" });

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
