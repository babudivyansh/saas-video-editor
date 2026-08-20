import { NextRequest, NextResponse } from "next/server";
import { runFFmpegWithProgress } from "@/utils/ffmpeg-render";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { checkFreeToolDailyCap, freeToolCapResponseBody } from "@/lib/free-tool-caps";
import { createJobStatusHandler } from "@/lib/job-routes";
import { getAuthUser } from "@/lib/auth";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// MP3 quality presets → constant bitrate. Mirrors the Crayo selector labels.
const QUALITY_BITRATE: Record<string, string> = {
  minimum: "64k",
  low: "128k",
  medium: "192k",
  high: "256k",
  maximum: "320k",
};

interface Job {
  progress: number;
  status: "processing" | "done" | "error";
  inputPath: string;
  outputPath: string;
  downloadName: string;
  error?: string;
  createdAt: number;
}

// Module-level job store (single-instance server). Same pattern as the render queue.
const g = globalThis as unknown as { __mp3Jobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__mp3Jobs ?? (g.__mp3Jobs = new Map());

// Sweep abandoned jobs older than 30 min.
function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) { try { fs.unlinkSync(f); } catch {} }
      jobs.delete(id);
    }
  }
}

// ── POST: start a conversion, return a jobId immediately ──────────────────────
export async function POST(req: NextRequest) {
  const limit = await rateLimit(`mp3-converter:ip:${getClientIp(req)}`, 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const daily = await checkFreeToolDailyCap("mp3-converter", `ip:${getClientIp(req)}`);
  if (!daily.allowed) {
    return NextResponse.json(freeToolCapResponseBody("mp3-converter", daily.cap), { status: 429 });
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

  // Anonymously callable free tool (see audio-balancer/route.ts for the same
  // note) — resolve a real plan cap when a session is present, else fall
  // back to just the feature's technical ceiling.
  const auth = await getAuthUser(req);
  const policy = await resolveUploadPolicy(auth?.userId ?? null, "mp3-converter");
  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const quality = (formData.get("quality") as string | null) ?? "medium";
  const bitrate = QUALITY_BITRATE[quality] ?? QUALITY_BITRATE.medium;

  const jobId = randomUUID();
  const inputExt = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `${file.name.replace(/\.[^.]+$/, "")}.mp3`;

  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

  const job: Job = {
    progress: 0, status: "processing", inputPath, outputPath, downloadName, createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Kick off conversion without blocking the response.
  runFFmpegWithProgress(
    ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-b:a", bitrate, outputPath],
    (pct) => { job.progress = pct; },
  )
    .then(() => { job.progress = 100; job.status = "done"; })
    .catch((err) => { job.status = "error"; job.error = err instanceof Error ? err.message : "Conversion failed"; })
    .finally(() => { try { fs.unlinkSync(inputPath); } catch {} });

  return NextResponse.json({ jobId }, { status: 202 });
}

// ── GET: poll progress (?jobId=) or download the result (?jobId=&download=1) ───
async function handleGET(req: NextRequest) {
  const limit = await rateLimit(`mp3-converter:status:ip:${getClientIp(req)}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  return createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true, allowAnonymous: true })(req);
}

export const GET = handleGET;
