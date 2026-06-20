import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";

export const maxDuration = 120;

const CREDIT_COST = 2;
const FAL_MODEL = "fal-ai/face-swap";

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPaths: string[];
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
  userId: string;
  refunded: boolean;
}

const g = globalThis as unknown as { __faceSwapJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__faceSwapJobs ?? (g.__faceSwapJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [...job.inputPaths, job.outputPath]) {
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
  return { Authorization: `Key ${process.env.FAL_KEY}` };
}

async function uploadToFal(buffer: Buffer, mimeType: string): Promise<string> {
  const res = await fetch("https://storage.fal.run", {
    method: "POST",
    headers: { ...falAuth(), "Content-Type": mimeType },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`fal.ai upload failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.url ?? data.access_url) as string;
}

async function submitToFal(swapImageUrl: string, baseImageUrl: string): Promise<string> {
  const res = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: { ...falAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      swap_image_url: swapImageUrl,   // the face to use (character image)
      base_image_url: baseImageUrl,   // the target to swap into
    }),
  });
  if (!res.ok) throw new Error(`fal.ai submit error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.request_id as string;
}

async function pollFal(requestId: string): Promise<string> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: falAuth() }
    );
    if (!statusRes.ok) continue;
    const s = await statusRes.json();
    if (s.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: falAuth() }
      );
      if (!resultRes.ok) throw new Error("fal.ai result fetch failed");
      const result = await resultRes.json();
      const url = result?.image?.url ?? result?.images?.[0]?.url ?? result?.output?.url;
      if (!url) throw new Error("No image URL in fal.ai result");
      return url as string;
    }
    if (s.status === "FAILED") throw new Error(s.error ?? "fal.ai face swap failed");
  }
  throw new Error("Face swap timed out");
}

// POST – start job
export async function POST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: "Face swap not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 }); }

  const characterFile = formData.get("characterImage") as File | null;
  const targetFile    = formData.get("targetImage")    as File | null;
  if (!characterFile || !targetFile) {
    return NextResponse.json({ error: "Both characterImage and targetImage are required" }, { status: 400 });
  }

  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  for (const f of [characterFile, targetFile]) {
    if (!allowed.includes(f.type)) {
      return NextResponse.json({ error: "Only PNG, JPG, WEBP images are supported" }, { status: 400 });
    }
    if (f.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Each image must be under 10 MB" }, { status: 413 });
    }
  }

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
  const charExt = (characterFile.name.split(".").pop() ?? "jpg").toLowerCase();
  const targExt = (targetFile.name.split(".").pop() ?? "jpg").toLowerCase();
  const charPath = path.join(os.tmpdir(), `${jobId}-char.${charExt}`);
  const targPath = path.join(os.tmpdir(), `${jobId}-targ.${targExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.jpg`);

  fs.writeFileSync(charPath, Buffer.from(await characterFile.arrayBuffer()));
  fs.writeFileSync(targPath, Buffer.from(await targetFile.arrayBuffer()));

  const job: Job = {
    progress: 5,
    status: "processing",
    inputPaths: [charPath, targPath],
    outputPath,
    downloadName: "face-swap-result.jpg",
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      job.progress = 15;
      const [charUrl, targUrl] = await Promise.all([
        uploadToFal(fs.readFileSync(charPath), characterFile.type),
        uploadToFal(fs.readFileSync(targPath), targetFile.type),
      ]);
      job.progress = 35;

      const requestId = await submitToFal(charUrl, targUrl);
      job.progress = 45;

      const ticker = setInterval(() => {
        if (job.progress < 85) job.progress += 4;
      }, 3000);

      let resultUrl: string;
      try { resultUrl = await pollFal(requestId); }
      finally { clearInterval(ticker); }

      job.progress = 90;

      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) throw new Error("Failed to download result");
      fs.writeFileSync(outputPath, Buffer.from(await dlRes.arrayBuffer()));

      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Unknown error";
      if (!job.refunded) {
        job.refunded = true;
        await refundCredit(auth.userId).catch(console.error);
      }
    } finally {
      for (const p of [charPath, targPath]) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }
  })();

  return NextResponse.json({ jobId });
}

// GET – poll or download
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId   = searchParams.get("jobId");
  const download = searchParams.get("download");

  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.userId !== auth.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (download === "1") {
    if (job.status !== "done") return NextResponse.json({ error: "Not ready" }, { status: 409 });
    if (!fs.existsSync(job.outputPath)) return NextResponse.json({ error: "Output file missing" }, { status: 404 });
    const buf = fs.readFileSync(job.outputPath);
    return new Response(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${job.downloadName}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ progress: job.progress, status: job.status, error: job.error });
}
