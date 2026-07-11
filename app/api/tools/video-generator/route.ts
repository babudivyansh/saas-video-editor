import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { firePostCreditSpendEmails, fireZeroCreditsEmail } from "@/lib/credit-events";
import { attachmentDisposition } from "@/utils/content-disposition";
import { withRateLimit } from "@/lib/with-rate-limit";
import { env } from "@/lib/env";
import { getVideoModel } from "@/lib/models/videoModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// Veo3 Fast is $0.15/s with audio (fal.ai cut this ~50% in 2026 — it used to
// be $0.40/s). 8s w/ audio now costs ~$1.20 = ~₹114 at ₹95/$1, well under the
// 35-credit price even on the cheapest per-credit plan. Standard/4K can be
// reintroduced as a premium tier later.
const MAX_DURATION = 8;

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
  creditCost: number;
  usedVeo3Credits: boolean; // which pool was deducted from — needed for refund
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

async function refundCredit(userId: string, creditCost: number, useVeo3Credits: boolean) {
  if (useVeo3Credits) {
    await prisma.user.update({
      where: { id: userId },
      data: { veo3Credits: { increment: creditCost } },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: creditCost } },
    });
    const cached = await redis.get(`credits:${userId}`);
    if (cached !== null) {
      await redis.set(`credits:${userId}`, String(parseInt(cached, 10) + creditCost), "EX", 3600);
    }
  }
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Video generation is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  let body: {
    prompt?: string;
    model?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    fps?: number;
    motion?: string;
    seed?: number;
    referenceImageUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt too long (max 2000 chars)" }, { status: 400 });

  const modelEntry = getVideoModel(body.model);
  const CREDIT_COST = modelEntry.creditCost;
  const isVeo3 = modelEntry.integration === "direct-veo3-fast";
  const referenceImageUrl = body.referenceImageUrl ?? null;

  if (modelEntry.imageInput === "required" && !referenceImageUrl) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires a reference image upload` },
      { status: 400 },
    );
  }

  // Decide which pool to use. Only Veo3 may ever draw from the restricted
  // veo3Credits pool — every other model always uses the regular credits pool
  // with its own registry-defined cost, even if the user has leftover veo3Credits.
  let useVeo3Credits = false;
  if (isVeo3) {
    // Fetch veo3Credits + regular credits + gate flag in one query.
    const me = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { veo3Enabled: true, veo3Credits: true },
    });

    // Gate: must have veo3Enabled OR have veo3Credits from the Veo3 pack.
    const hasVeo3Access = me?.veo3Enabled || (me?.veo3Credits ?? 0) >= CREDIT_COST;
    if (!hasVeo3Access) {
      return NextResponse.json(
        { error: "AI Video (Veo3) is locked. Upgrade to a yearly plan or buy a Veo3 Video Pack." },
        { status: 403 },
      );
    }

    // Decide which pool to use: veo3Credits first, then regular credits.
    useVeo3Credits = (me?.veo3Credits ?? 0) >= CREDIT_COST;
  }

  if (!useVeo3Credits) {
    const cachedCredits = await redis.get(`credits:${auth.userId}`);
    const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
    if (cached !== null && cached < CREDIT_COST) {
      return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
    }
  }

  // Locked to the fast model and capped at 8s to bound API cost (Veo3 only).
  const falModelId = modelEntry.falEndpoint;
  const duration = isVeo3 ? Math.min(body.duration ?? MAX_DURATION, MAX_DURATION) : (body.duration ?? MAX_DURATION);
  const aspectRatio = body.aspectRatio ?? "16:9";

  // Deduct from the chosen pool.
  if (useVeo3Credits) {
    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: { veo3Credits: { decrement: CREDIT_COST } },
      select: { veo3Credits: true },
    });
    if (user.veo3Credits < 0) {
      await prisma.user.update({ where: { id: auth.userId }, data: { veo3Credits: { increment: CREDIT_COST } } });
      return NextResponse.json({ error: `Insufficient Veo3 credits (need ${CREDIT_COST})` }, { status: 402 });
    }
  } else {
    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: { credits: { decrement: CREDIT_COST } },
      select: { credits: true },
    });
    if (user.credits < 0) {
      await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
      fireZeroCreditsEmail(auth.userId);
      return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
    }
    await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);
    firePostCreditSpendEmails(auth.userId, user.credits);
  }

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
    creditCost: CREDIT_COST,
    usedVeo3Credits: useVeo3Credits,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress = 10;

      let falInput: Record<string, unknown>;
      let resultPath: string[];
      if (isVeo3) {
        // Exactly today's Veo3 input shape/result extraction — unchanged.
        falInput = { prompt, duration, aspect_ratio: aspectRatio };
        if (referenceImageUrl) falInput.image_url = referenceImageUrl;
        resultPath = ["video.url"];
      } else {
        const bodyValues: Partial<Record<typeof modelEntry.supportedParameters[number], string | number>> = {
          duration,
          aspectRatio,
          resolution: body.resolution,
          fps: body.fps,
          motion: body.motion,
          seed: body.seed,
        };
        falInput = {};
        for (const p of modelEntry.supportedParameters) {
          if (p === "imageUpload") continue;
          const key = modelEntry.integration === "fal" ? (modelEntry.inputMap[p] ?? p) : p;
          if (p === "prompt") falInput[key] = prompt;
          else if (bodyValues[p] !== undefined) falInput[key] = bodyValues[p];
          else if (modelEntry.defaultValues[p] !== undefined) falInput[key] = modelEntry.defaultValues[p];
        }
        if (referenceImageUrl) falInput.image_url = referenceImageUrl;
        resultPath = modelEntry.integration === "fal" ? modelEntry.resultPath : ["video.url"];
      }

      const requestId = await falSubmit(falModelId, falInput);
      job.progress = 15;

      // Simulate progress while waiting
      const progressTimer = setInterval(() => {
        if (job.progress < 88) job.progress += 3;
      }, 10000);

      let videoUrl: string;
      try {
        const raw = await falPollUntilDone(falModelId, requestId);
        videoUrl = extractResultUrl(raw, resultPath);
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
        try { await refundCredit(job.userId, job.creditCost, job.usedVeo3Credits); } catch { /* swallow */ }
      }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:video-generator" });

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
