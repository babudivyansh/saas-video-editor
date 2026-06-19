import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import {
  extractAudio,
  generateASS,
  runSplitScreenFFmpeg,
  styleIndexToSubtitleStyle,
} from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { WordTiming } from "@/utils/elevenlabs";
import { downloadFile } from "@/utils/download";
import os from "os";
import path from "path";
import fs from "fs";
import { InProcessQueue } from "@/lib/job-queue";

export const maxDuration = 300;

const CREDIT_COST = 1;

// Refund the credit charged at enqueue time when an async render job fails.
async function refundRenderCredit(projectId: string) {
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await prisma.user.update({ where: { id: proj.userId }, data: { credits: { increment: CREDIT_COST } } });
    const cached = await redis.get(`credits:${proj.userId}`);
    if (cached !== null) {
      await redis.set(`credits:${proj.userId}`, String(parseInt(cached, 10) + CREDIT_COST), "EX", 3600);
    }
  } catch (e) {
    console.error(`[refund] failed to refund credit for project ${projectId}:`, e);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SplitScreenPayload {
  projectId: string;
  bgVideoUrl: string;
  subtitleStyleIndex: number;
  mode: "oneword" | "lines";
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// downloadFile is imported from utils/download: it follows redirects and rejects
// on non-200 responses, so an unreachable/404 background URL fails fast with a
// clear error instead of silently writing an HTML error page as the "video".

async function transcribeWithWhisper(audioPath: string): Promise<WordTiming[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[split-screen] OPENAI_API_KEY not set — skipping transcription");
    return [];
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { words?: { word: string; start: number; end: number }[] };
  return (data.words ?? []).map((w) => ({
    word: w.word.trim(),
    start: Math.round(w.start * 1000),
    end: Math.round(w.end * 1000),
  }));
}

// ── Job worker ───────────────────────────────────────────────────────────────

async function renderJob(payload: SplitScreenPayload): Promise<void> {
  const { projectId, bgVideoUrl, subtitleStyleIndex, mode } = payload;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) {
    throw new Error(`Project ${projectId} missing uploadedVideoUrl`);
  }

  const tmp = os.tmpdir();
  const userPath  = path.join(tmp, `${projectId}-user.mp4`);
  const bgPath    = path.join(tmp, `${projectId}-bg.mp4`);
  const audioPath = path.join(tmp, `${projectId}-audio.mp3`);
  const assPath   = path.join(tmp, `${projectId}.ass`);
  const outPath   = path.join(tmp, `${projectId}-output.mp4`);

  try {
    await Promise.all([
      downloadFile(project.uploadedVideoUrl, userPath),
      downloadFile(bgVideoUrl, bgPath),
    ]);

    await extractAudio(userPath, audioPath);

    let wordTimings: WordTiming[] = [];
    try {
      wordTimings = await transcribeWithWhisper(audioPath);
    } catch (err) {
      console.warn("[split-screen] Whisper transcription failed, rendering without subtitles:", err);
    }

    const subtitleStyle = styleIndexToSubtitleStyle(subtitleStyleIndex, mode);
    generateASS(wordTimings, subtitleStyle, assPath);

    await runSplitScreenFFmpeg({ userVideoPath: userPath, bgVideoPath: bgPath, assPath, outputPath: outPath });

    const s3Key = `renders/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, s3Key, "video/mp4");

    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl } });
  } catch (err) {
    console.error(`[split-screen] render failed for ${projectId}:`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(projectId);
  } finally {
    for (const f of [userPath, bgPath, audioPath, assPath, outPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

// Lazy singleton queue
let _queue: InProcessQueue<SplitScreenPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<SplitScreenPayload>("split-screen", renderJob);
  return _queue;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as Partial<SplitScreenPayload>;
  if (!body.projectId || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId and bgVideoUrl required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project has no uploaded video" }, { status: 400 });
  }

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
  await prisma.project.update({ where: { id: body.projectId }, data: { status: "rendering" } });

  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    bgVideoUrl: body.bgVideoUrl,
    subtitleStyleIndex: body.subtitleStyleIndex ?? 0,
    mode: body.mode ?? "oneword",
  });

  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}
