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

const MODE_FILTERS: Record<string, string[]> = {
  "left-only": ["-af", "pan=stereo|c0=c0|c1=c0"],
  "balance-center": ["-af", "loudnorm=I=-23:TP=-2:LRA=7"],
  "right-only": ["-af", "pan=stereo|c0=c1|c1=c1"],
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

const g = globalThis as unknown as { __audioJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__audioJobs ?? (g.__audioJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) { try { fs.unlinkSync(f); } catch {} }
      jobs.delete(id);
    }
  }
}

export async function POST(req: NextRequest) {
  const limit = await rateLimit(`audio-balancer:ip:${getClientIp(req)}`, 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const daily = await checkFreeToolDailyCap("audio-balancer", `ip:${getClientIp(req)}`);
  if (!daily.allowed) {
    return NextResponse.json(freeToolCapResponseBody("audio-balancer", daily.cap), { status: 429 });
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

  // This route is intentionally callable anonymously (IP-rate-limited free
  // tool, no login wall on the API itself — only /dashboard/tools/free/* is
  // login-gated at the page level). When a session IS present, resolve the
  // real subscription tier so a logged-in paid user gets their actual plan
  // cap instead of the flat feature ceiling; an anonymous caller only gets
  // the feature's technical ceiling, since there's no plan to resolve.
  const auth = await getAuthUser(req);
  const policy = await resolveUploadPolicy(auth?.userId ?? null, "audio-balancer");
  try {
    assertWithinUploadPolicy(policy, file.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const mode = (formData.get("mode") as string | null) ?? "balance-center";
  const filterArgs = MODE_FILTERS[mode] ?? MODE_FILTERS["balance-center"];

  const jobId = randomUUID();
  const inputExt = (file.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp3`);
  const downloadName = `${file.name.replace(/\.[^.]+$/, "")}-balanced.mp3`;

  fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

  const job: Job = {
    progress: 0, status: "processing", inputPath, outputPath, downloadName, createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  runFFmpegWithProgress(
    ["-y", "-i", inputPath, ...filterArgs, "-acodec", "libmp3lame", "-q:a", "2", outputPath],
    (pct) => { job.progress = pct; },
  )
    .then(() => { job.progress = 100; job.status = "done"; })
    .catch((err) => { job.status = "error"; job.error = err instanceof Error ? err.message : "Balancing failed"; })
    .finally(() => { try { fs.unlinkSync(inputPath); } catch {} });

  return NextResponse.json({ jobId }, { status: 202 });
}

async function handleGET(req: NextRequest) {
  const limit = await rateLimit(`audio-balancer:status:ip:${getClientIp(req)}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  return createJobStatusHandler(jobs, { contentType: "audio/mpeg", deleteOnDownload: true, allowAnonymous: true })(req);
}

export const GET = handleGET;
