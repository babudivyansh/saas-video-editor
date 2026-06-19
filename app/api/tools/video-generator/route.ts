import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { attachmentDisposition } from "@/utils/content-disposition";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// Veo3 is the most expensive API (~₹114 per 8s fast render). Priced at 20
// credits and locked to the fast model + 8s cap to keep margins positive.
// Standard/4K can be reintroduced as a premium tier later.
const CREDIT_COST = 20;
const MAX_DURATION = 8;

const VEO3_FAST_MODEL = "fal-ai/veo3/fast";

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
}

const g = globalThis as unknown as { __videoGenJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__videoGenJobs ?? (g.__videoGenJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
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
  return { Authorization: `Key ${process.env.FAL_KEY}` };
}

async function falSubmit(modelId: string, input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://queue.fal.run/${modelId}`, {
    method: "POST",
    headers: { ...falAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fal.ai submit error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.request_id as string;
}

async function falPollUntilDone(modelId: string, requestId: string): Promise<string> {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://queue.fal.run/${modelId}/requests/${requestId}/status`,
      { headers: falAuth() },
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.status as string;
    if (status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${modelId}/requests/${requestId}`,
        { headers: falAuth() },
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const videoUrl = result.video?.url as string | undefined;
      if (!videoUrl) throw new Error("No video URL in fal.ai result");
      return videoUrl;
    }
    if (status === "FAILED") {
      const err = statusData.error ?? "fal.ai generation failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("fal.ai generation timed out after 12 minutes");
}

export async function POST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: "Video generation is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  // Veo3 is gated: requires a plan that bundles it or the ₹599 add-on.
  const me = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { veo3Enabled: true },
  });
  if (!me?.veo3Enabled) {
    return NextResponse.json(
      { error: "AI Video (Veo3) is locked. Add it to your plan or upgrade to a plan that includes it." },
      { status: 403 },
    );
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  let body: { prompt?: string; model?: string; duration?: number; aspectRatio?: string; referenceImageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt too long (max 2000 chars)" }, { status: 400 });

  // Locked to the fast model and capped at 8s to bound API cost.
  const falModelId = VEO3_FAST_MODEL;
  const duration = Math.min(body.duration ?? MAX_DURATION, MAX_DURATION);
  const aspectRatio = body.aspectRatio ?? "16:9";
  const referenceImageUrl = body.referenceImageUrl ?? null;

  // Deduct credits
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `ai-video-${Date.now()}.mp4`;

  const job: Job = {
    progress: 5,
    status: "processing",
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

      const falInput: Record<string, unknown> = {
        prompt,
        duration,
        aspect_ratio: aspectRatio,
      };
      if (referenceImageUrl) falInput.image_url = referenceImageUrl;

      const requestId = await falSubmit(falModelId, falInput);
      job.progress = 15;

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 10000);

      let videoUrl: string;
      try {
        videoUrl = await falPollUntilDone(falModelId, requestId);
      } finally {
        clearInterval(progressTimer);
      }

      job.progress = 92;

      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error("Failed to download video from fal.ai");
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);

      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Video generation failed";
      if (!job.refunded) {
        job.refunded = true;
        try { await refundCredit(job.userId); } catch { /* swallow */ }
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
