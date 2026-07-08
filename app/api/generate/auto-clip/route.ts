import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { markQuestComplete } from "@/lib/quests";
import { downloadFile } from "@/utils/download";
import { extractAudio, runFFmpegArgs, runFFmpegWithProgress, getMediaDurationSec } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { transcribeAudio } from "@/utils/elevenlabs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { InProcessQueue } from "@/lib/job-queue";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import os from "os";
import path from "path";
import fs from "fs";

export const maxDuration = 300;

const CREDIT_COST = 2;

interface AutoClipPayload {
  projectId: string;
  minDuration: number;
  maxDuration: number;
  clipCount: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  instructions: string;
}

interface ClipSegment {
  start: number; // seconds
  end: number;   // seconds
  title: string; // AI hook/title
  score: number; // virality 0–99
}

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
    logger.error("auto-clip", `failed to refund credit for project ${projectId}`, e);
  }
}

function aspectRatioFilter(ratio: "9:16" | "16:9" | "1:1"): string {
  switch (ratio) {
    case "9:16": return "crop=in_h*9/16:in_h";
    case "16:9": return "crop=in_w:in_w*9/16";
    case "1:1":  return "crop=in_h:in_h";
  }
}

async function getClipsFromGemini(
  transcriptText: string,
  durationSec: number,
  clipCount: number,
  minDuration: number,
  maxDuration: number,
  instructions: string,
): Promise<ClipSegment[]> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const hasTranscript = transcriptText.trim().length > 0;

  const sharedRules = `Return ONLY a valid JSON array — no explanation, no markdown fences. Example:
[{"start":12.5,"end":35.0,"title":"The mistake everyone makes","score":87},{"start":67.2,"end":95.4,"title":"Why this changes everything","score":72}]

For each clip include:
- "title": a short, punchy, scroll-stopping hook (max 60 characters), no quotes inside
- "score": a virality score 0–99 (how likely this clip is to go viral on TikTok/Reels/Shorts)

Rules:
- Return exactly ${clipCount} clip(s)
- Each clip between ${minDuration}s and ${maxDuration}s long
- Clips must not overlap
- start/end within 0 and ${durationSec.toFixed(1)}
- Sort by start time ascending`;

  const prompt = hasTranscript
    ? `You are a viral video editor. Analyze this transcript and select the ${clipCount} most engaging clips.

Each clip must be between ${minDuration} and ${maxDuration} seconds long.
${instructions ? `User instructions: ${instructions}` : "Focus on the most engaging, entertaining, or high-energy moments."}

Video duration: ${durationSec.toFixed(1)} seconds

Transcript (format: [seconds] word):
${transcriptText}

${sharedRules}`
    : `You are a viral video editor. Select ${clipCount} clips from a ${durationSec.toFixed(1)}-second video.

Each clip must be between ${minDuration} and ${maxDuration} seconds long.
${instructions ? `User instructions: ${instructions}` : "Space clips across the video to capture a variety of moments."}

${sharedRules}`;

  const result = await withRetry(
    (signal) => model.generateContent(prompt, { signal }),
    { timeoutMs: 30_000 },
  );
  const text = result.response.text().trim();

  // Strip accidental markdown code fences and extract the JSON array
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON array");

  const raw = JSON.parse(jsonMatch[0]) as Array<{ start: number; end: number; title?: string; score?: number }>;

  return raw
    .filter(c => typeof c.start === "number" && typeof c.end === "number" && c.end > c.start)
    .map((c, i) => ({
      start: Math.max(0, Math.min(c.start, durationSec - 1)),
      end: Math.min(c.end, durationSec),
      title: (typeof c.title === "string" && c.title.trim()) ? c.title.trim().slice(0, 80) : `Clip ${i + 1}`,
      score: Math.max(0, Math.min(99, Math.round(typeof c.score === "number" ? c.score : 50))),
    }))
    .slice(0, clipCount);
}

async function renderJob(payload: AutoClipPayload): Promise<void> {
  const { projectId, minDuration, maxDuration, clipCount, aspectRatio, instructions } = payload;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) throw new Error(`Project ${projectId} missing uploadedVideoUrl`);

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src.mp4`);
  const audioPath = path.join(tmp, `${projectId}-audio.mp3`);
  const tmpPaths: string[] = [videoPath, audioPath];

  try {
    // 1. Download source video from S3
    await downloadFile(project.uploadedVideoUrl, videoPath);

    // 2. Get video duration so Gemini can work within bounds
    const durationSec = await getMediaDurationSec(videoPath);
    if (durationSec < minDuration) {
      throw new Error(`Video is too short (${durationSec.toFixed(1)}s) for the requested clip duration (min ${minDuration}s)`);
    }

    // 3. Transcribe for Gemini context — gracefully skip if ElevenLabs not configured
    let transcriptText = "";
    try {
      await extractAudio(videoPath, audioPath);
      const audioBuffer = fs.readFileSync(audioPath);
      const wordTimings = await transcribeAudio(audioBuffer);
      // Compact format: [start_sec] word [start_sec] word ...
      transcriptText = wordTimings
        .map(w => `[${(w.start / 1000).toFixed(2)}] ${w.word}`)
        .join(" ");
    } catch (err) {
      logger.warn("auto-clip", "transcription skipped, Gemini will work without transcript", err);
    }

    // 4. Ask Gemini to pick the best clip timestamps
    const segments = await getClipsFromGemini(
      transcriptText, durationSec, clipCount, minDuration, maxDuration, instructions,
    );
    if (segments.length === 0) throw new Error("Gemini returned no valid clip segments");

    // 5. Persist one Clip row per segment, then render + upload each separately
    //    so the UI can show every clip as its own card with live progress.
    const cropFilter = aspectRatioFilter(aspectRatio);
    const clipRows = await Promise.all(
      segments.map((seg, i) =>
        prisma.clip.create({
          data: {
            projectId,
            index: i,
            title: seg.title,
            startSec: seg.start,
            endSec: seg.end,
            durationSec: seg.end - seg.start,
            aspectRatio,
            score: seg.score,
            status: "queued",
          },
        }),
      ),
    );

    let readyCount = 0;
    let bestUrl: string | null = null;
    let bestScore = -1;
    let lastProgressAt = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const row = clipRows[i];
      const clipPath = path.join(tmp, `${projectId}-clip${i}.mp4`);
      const thumbPath = path.join(tmp, `${projectId}-clip${i}.jpg`);
      tmpPaths.push(clipPath, thumbPath);

      try {
        await prisma.clip.update({ where: { id: row.id }, data: { status: "rendering", progress: 5 } });

        // Cut + crop with throttled live progress (0–85% of the bar).
        await runFFmpegWithProgress(
          [
            "-y", "-ss", String(seg.start), "-to", String(seg.end), "-i", videoPath,
            "-vf", cropFilter,
            "-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-c:a", "aac",
            clipPath,
          ],
          (pct) => {
            const now = Date.now();
            if (now - lastProgressAt < 1200) return;
            lastProgressAt = now;
            void prisma.clip
              .update({ where: { id: row.id }, data: { progress: Math.round(5 + pct * 0.8) } })
              .catch(() => {});
          },
        );

        // Thumbnail from the clip midpoint (best-effort).
        await prisma.clip.update({ where: { id: row.id }, data: { progress: 88 } });
        await runFFmpegArgs([
          "-y", "-ss", String((seg.end - seg.start) / 2), "-i", clipPath,
          "-frames:v", "1", "-vf", "scale=480:-2", thumbPath,
        ]).catch(() => {});

        const videoUrl = await uploadFileToS3(clipPath, `renders/${projectId}/clip-${i}.mp4`, "video/mp4");
        const thumbnailUrl = fs.existsSync(thumbPath)
          ? await uploadFileToS3(thumbPath, `renders/${projectId}/clip-${i}.jpg`, "image/jpeg").catch(() => null)
          : null;

        await prisma.clip.update({
          where: { id: row.id },
          data: { status: "ready", progress: 100, videoUrl, thumbnailUrl },
        });
        readyCount++;
        if (seg.score > bestScore) { bestScore = seg.score; bestUrl = videoUrl; }
      } catch (err) {
        logger.error("auto-clip", `clip ${i} failed for ${projectId}`, err);
        await prisma.clip.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => {});
      }
    }

    // 6. Finalize — fail (and refund) only if every clip failed.
    if (readyCount === 0) {
      await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
      await refundRenderCredit(projectId);
    } else {
      await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: bestUrl } });
    }
  } catch (err) {
    logger.error("auto-clip", `render failed for ${projectId}`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(projectId);
  } finally {
    for (const f of tmpPaths) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

let _queue: InProcessQueue<AutoClipPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<AutoClipPayload>("auto-clip", renderJob);
  return _queue;
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Auto-clip is not configured on this server" }, { status: 503 });
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as Partial<AutoClipPayload>;
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.uploadedVideoUrl) {
    return NextResponse.json({ error: "Project has no uploaded video" }, { status: 400 });
  }

  // Deduct credits (double-checked after decrement to handle race conditions)
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
    minDuration: body.minDuration ?? 15,
    maxDuration: body.maxDuration ?? 60,
    clipCount: Math.min(body.clipCount ?? 5, 20),
    aspectRatio: body.aspectRatio ?? "9:16",
    instructions: body.instructions ?? "",
  });

  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:auto-clip" });
