import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { InProcessQueue } from "@/lib/job-queue";
import { synthesizeVoice, WordTiming } from "@/utils/elevenlabs";
import { generateASS, runFFmpeg, runFFmpegArgs, styleIndexToSubtitleStyle } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { resolveVoiceId } from "@/utils/voice-ids";
import { downloadFile } from "@/utils/download";

const CREDIT_COST = 2;

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

interface RedditVideoPayload {
  projectId: string;
  postTitle: string;
  username: string;
  script: string;
  introVoiceId: string;
  scriptVoiceId: string;
  bgMusicUrl: string;
  bgVideoUrl: string;
  subtitleStyleIndex: number;
  subtitleMode: "oneword" | "lines";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function concatAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 1) {
    fs.copyFileSync(audioPaths[0], outputPath);
    return;
  }
  // Write concat list file
  const listPath = outputPath + ".txt";
  const listContent = audioPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(listPath, listContent, "utf8");
  await runFFmpegArgs(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
  fs.unlinkSync(listPath);
}

// Get last word timing end time in milliseconds (= total TTS duration)
function getTtsDurationMs(wordTimings: WordTiming[]): number {
  if (!wordTimings.length) return 0;
  return wordTimings[wordTimings.length - 1].end;
}

// Offset all word timing timestamps by deltaMs
function offsetTimings(timings: WordTiming[], deltaMs: number): WordTiming[] {
  return timings.map(w => ({ ...w, start: w.start + deltaMs, end: w.end + deltaMs }));
}

// ── Real render pipeline ──────────────────────────────────────────────────────

async function renderRedditJob(payload: RedditVideoPayload): Promise<void> {
  const { projectId, postTitle, username, script, introVoiceId, scriptVoiceId,
          bgMusicUrl, bgVideoUrl, subtitleStyleIndex, subtitleMode } = payload;

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasAWS = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_S3_BUCKET;

  // ── Simulation fallback (no API keys) ────────────────────────────────────
  if (!hasElevenLabs || !hasAWS) {
    console.warn("[reddit-video] Missing credentials — simulating render");
    await new Promise(r => setTimeout(r, 3000));
    const fallbackUrl = bgVideoUrl || "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/subway-surfers.mp4";
    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallbackUrl } });
    return;
  }

  // ── Real pipeline ─────────────────────────────────────────────────────────
  const tmpDir = path.join(os.tmpdir(), `reddit-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    console.log(`[reddit-video] Starting render for ${projectId}`);

    // 1. TTS — intro (post title, read by intro voice)
    const introText = `Posted by u/${username}: ${postTitle}`;
    const resolvedIntroId = resolveVoiceId(introVoiceId);
    const resolvedScriptId = resolveVoiceId(scriptVoiceId);

    console.log("[reddit-video] Generating intro TTS...");
    const introResult = await synthesizeVoice(introText, resolvedIntroId);
    const introAudioPath = path.join(tmpDir, "intro.mp3");
    fs.writeFileSync(introAudioPath, introResult.audioBuffer);

    const introDurationMs = getTtsDurationMs(introResult.wordTimings);

    // 2. TTS — main script
    console.log("[reddit-video] Generating script TTS...");
    const scriptResult = await synthesizeVoice(script, resolvedScriptId);
    const scriptAudioPath = path.join(tmpDir, "script.mp3");
    fs.writeFileSync(scriptAudioPath, scriptResult.audioBuffer);

    // 3. Concatenate audio (intro + 500ms gap + script)
    console.log("[reddit-video] Concatenating audio...");
    const combinedAudioPath = path.join(tmpDir, "voice.mp3");

    // Add 500ms silence gap between intro and script
    const silencePath = path.join(tmpDir, "silence.mp3");
    await runFFmpegArgs([
      "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "0.5", "-c:a", "libmp3lame", "-q:a", "3", silencePath
    ]);

    await concatAudioFiles([introAudioPath, silencePath, scriptAudioPath], combinedAudioPath);

    // 4. Combine word timings with correct offsets
    const gapMs = 500;
    const combinedTimings: WordTiming[] = [
      ...introResult.wordTimings,
      ...offsetTimings(scriptResult.wordTimings, introDurationMs + gapMs),
    ];

    // 5. Generate ASS subtitles
    console.log("[reddit-video] Generating subtitles...");
    const subtitleStyle = styleIndexToSubtitleStyle(subtitleStyleIndex, subtitleMode);
    const assPath = path.join(tmpDir, "subs.ass");
    generateASS(combinedTimings, subtitleStyle, assPath);

    // 6. Download background video
    console.log("[reddit-video] Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);

    // 7. Download background music (optional, best-effort — a missing/unreachable
    // music URL must not fail the whole render)
    let musicPath: string | undefined;
    if (bgMusicUrl) {
      console.log("[reddit-video] Downloading background music...");
      const candidate = path.join(tmpDir, "music.mp3");
      try {
        await downloadFile(bgMusicUrl, candidate);
        musicPath = candidate;
      } catch (err) {
        console.warn("[reddit-video] Background music unavailable, continuing without it:", err);
        musicPath = undefined;
      }
    }

    // 8. FFmpeg — compose final video
    // Layout: 9:16 portrait, gameplay video looped, subtitles overlaid
    // Reddit card intro text is spoken but no visual card overlay (clean approach)
    console.log("[reddit-video] Running FFmpeg...");
    const outputPath = path.join(tmpDir, "output.mp4");
    await runFFmpeg({
      bgVideoPath,
      voiceAudioPath: combinedAudioPath,
      musicAudioPath: musicPath,
      assPath,
      outputPath,
    });

    // 9. Upload to S3
    console.log("[reddit-video] Uploading to S3...");
    const s3Key = `reddit-videos/${projectId}/output.mp4`;
    const videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");

    // 10. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl },
    });
    console.log(`[reddit-video] Done: ${videoUrl}`);

  } catch (err) {
    console.error(`[reddit-video] render failed for ${projectId}:`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
    await refundRenderCredit(projectId);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────

let _queue: InProcessQueue<RedditVideoPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<RedditVideoPayload>("reddit-video", renderRedditJob);
  return _queue;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fast credit check via Redis
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const credits = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (credits !== null && credits < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json() as Partial<RedditVideoPayload>;
  if (!body.projectId || !body.script || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId, script, and bgVideoUrl required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Atomic credit deduction
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

  // Update project to rendering state
  await prisma.project.update({
    where: { id: body.projectId },
    data: {
      status: "rendering",
      script: body.script,
      voiceId: body.scriptVoiceId || "",
      musicUrl: body.bgMusicUrl || null,
      backgroundUrl: body.bgVideoUrl,
      subtitlesStyle: { styleIndex: body.subtitleStyleIndex ?? 0, mode: body.subtitleMode ?? "oneword" },
    },
  });

  // Enqueue background render job
  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    postTitle: body.postTitle || project.title || "",
    username: body.username || "AskReddit",
    script: body.script,
    introVoiceId: body.introVoiceId || "william",
    scriptVoiceId: body.scriptVoiceId || "william",
    bgMusicUrl: body.bgMusicUrl || "",
    bgVideoUrl: body.bgVideoUrl,
    subtitleStyleIndex: body.subtitleStyleIndex ?? 0,
    subtitleMode: body.subtitleMode ?? "oneword",
  });

  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}
