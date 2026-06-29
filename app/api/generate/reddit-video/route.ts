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
import { markQuestComplete } from "@/lib/quests";
import { renderRedditCard } from "@/utils/reddit-canvas";

const CREDIT_COST = 2;
const S3_HOST = "saas-video-editor-assets.s3.ap-south-1.amazonaws.com";

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

async function setProgress(projectId: string, n: number) {
  await prisma.project.update({ where: { id: projectId }, data: { progress: n } }).catch(() => {});
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
  voiceSettings?: { stability?: number; style?: number; similarityBoost?: number };
  language?: string;
  showIntroCard?: boolean;
  darkMode?: boolean;
  upvotes?: string;
  comments?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function concatAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 1) {
    fs.copyFileSync(audioPaths[0], outputPath);
    return;
  }
  const listPath = outputPath + ".txt";
  const listContent = audioPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(listPath, listContent, "utf8");
  await runFFmpegArgs(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
  fs.unlinkSync(listPath);
}

function getTtsDurationMs(wordTimings: WordTiming[]): number {
  if (!wordTimings.length) return 0;
  return wordTimings[wordTimings.length - 1].end;
}

function offsetTimings(timings: WordTiming[], deltaMs: number): WordTiming[] {
  return timings.map(w => ({ ...w, start: w.start + deltaMs, end: w.end + deltaMs }));
}

// ── Real render pipeline ──────────────────────────────────────────────────────

async function renderRedditJob(payload: RedditVideoPayload): Promise<void> {
  const {
    projectId, postTitle, username, script, introVoiceId, scriptVoiceId,
    bgMusicUrl, bgVideoUrl, subtitleStyleIndex, subtitleMode,
    voiceSettings: vs, language, showIntroCard = true, darkMode = true,
    upvotes = "0", comments = "0",
  } = payload;

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasAWS = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_S3_BUCKET;

  if (!hasElevenLabs || !hasAWS) {
    console.warn("[reddit-video] Missing credentials — simulating render");
    await new Promise(r => setTimeout(r, 3000));
    const fallbackUrl = bgVideoUrl || "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/subway-surfers.mp4";
    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallbackUrl, progress: 100 } });
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `reddit-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await setProgress(projectId, 5);
    console.log(`[reddit-video] Starting render for ${projectId}`);

    // Build ElevenLabs settings from payload
    const elevenLabsSettings: import("@/utils/elevenlabs").VoiceSettings | undefined =
      (vs || language) ? {
        stability: vs?.stability,
        style: vs?.style,
        similarityBoost: vs?.similarityBoost,
        languageCode: language && language !== "auto" ? language : undefined,
      } : undefined;

    // 1. TTS — intro
    const introText = `Posted by u/${username}: ${postTitle}`;
    const resolvedIntroId = resolveVoiceId(introVoiceId);
    const resolvedScriptId = resolveVoiceId(scriptVoiceId);

    console.log("[reddit-video] Generating intro TTS...");
    const introResult = await synthesizeVoice(introText, resolvedIntroId, elevenLabsSettings);
    const introAudioPath = path.join(tmpDir, "intro.mp3");
    fs.writeFileSync(introAudioPath, introResult.audioBuffer);
    const introDurationMs = getTtsDurationMs(introResult.wordTimings);
    await setProgress(projectId, 10);

    // 2. TTS — main script
    console.log("[reddit-video] Generating script TTS...");
    const scriptResult = await synthesizeVoice(script, resolvedScriptId, elevenLabsSettings);
    const scriptAudioPath = path.join(tmpDir, "script.mp3");
    fs.writeFileSync(scriptAudioPath, scriptResult.audioBuffer);
    await setProgress(projectId, 25);

    // 3. Concatenate audio (intro + 500ms gap + script)
    console.log("[reddit-video] Concatenating audio...");
    const combinedAudioPath = path.join(tmpDir, "voice.mp3");
    const silencePath = path.join(tmpDir, "silence.mp3");
    await runFFmpegArgs([
      "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "0.5", "-c:a", "libmp3lame", "-q:a", "3", silencePath,
    ]);
    await concatAudioFiles([introAudioPath, silencePath, scriptAudioPath], combinedAudioPath);
    await setProgress(projectId, 40);

    // 4. Word timings with offsets
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

    // 6. Render Reddit card PNG (optional)
    let introCardPath: string | undefined;
    if (showIntroCard) {
      console.log("[reddit-video] Rendering Reddit intro card...");
      const cardBuf = await renderRedditCard({ postTitle, username, upvotes, comments, darkMode });
      introCardPath = path.join(tmpDir, "reddit_card.png");
      fs.writeFileSync(introCardPath, cardBuf);
    }

    // 7. Download background video
    console.log("[reddit-video] Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);
    await setProgress(projectId, 55);

    // 8. Download background music (only from our S3 — reject 3rd-party CDNs)
    let musicPath: string | undefined;
    if (bgMusicUrl && bgMusicUrl.includes(S3_HOST)) {
      console.log("[reddit-video] Downloading background music...");
      const candidate = path.join(tmpDir, "music.mp3");
      try {
        await downloadFile(bgMusicUrl, candidate);
        musicPath = candidate;
      } catch (err) {
        console.warn("[reddit-video] Background music unavailable, continuing without it:", err);
      }
    }
    await setProgress(projectId, 60);

    // 9. FFmpeg — compose final video
    console.log("[reddit-video] Running FFmpeg...");
    const outputPath = path.join(tmpDir, "output.mp4");

    if (introCardPath) {
      // Build a custom filter_complex that overlays the Reddit card during intro narration
      const introDurSec = ((introDurationMs + gapMs) / 1000).toFixed(3);
      const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

      const musicInputIdx = musicPath ? 3 : -1;
      const cardInputIdx = musicPath ? 4 : 3;

      let filterComplex = "";
      // Scale BG video to 1080×1920
      filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];`;
      // Overlay Reddit card during intro window
      filterComplex += `[bg][${cardInputIdx}:v]overlay=0:0:enable='lte(t,${introDurSec})'[withcard];`;
      // Burn subtitles
      filterComplex += `[withcard]subtitles='${assEscaped}'[video]`;

      // Audio mixing
      if (musicPath && musicInputIdx > 0) {
        filterComplex = `${filterComplex.replace("[video]", "[video_nosub]")};` +
          `[${musicInputIdx}:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio]`;
        // rebuild properly
        filterComplex = "";
        filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];`;
        filterComplex += `[bg][${cardInputIdx}:v]overlay=0:0:enable='lte(t,${introDurSec})'[withcard];`;
        filterComplex += `[withcard]subtitles='${assEscaped}'[video];`;
        filterComplex += `[${musicInputIdx}:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio]`;
      } else {
        filterComplex += ";[1:a]acopy[audio]";
      }

      const args: string[] = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,   // 0: bg
        "-i", combinedAudioPath,                     // 1: voice
      ];
      if (musicPath) args.push("-i", musicPath);     // 2: music (optional) → index 3
      args.push("-loop", "1", "-i", introCardPath);  // card PNG → index 3 or 4

      args.push(
        "-filter_complex", filterComplex,
        "-map", "[video]",
        "-map", "[audio]",
        "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
        "-c:a", "aac", "-shortest",
        outputPath,
      );

      await runFFmpegArgs(args);
    } else {
      // No intro card — use simple runFFmpeg helper
      await runFFmpeg({ bgVideoPath, voiceAudioPath: combinedAudioPath, musicAudioPath: musicPath, assPath, outputPath });
    }

    await setProgress(projectId, 90);

    // 10. Upload to S3
    console.log("[reddit-video] Uploading to S3...");
    const s3Key = `reddit-videos/${projectId}/output.mp4`;
    const videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");
    await setProgress(projectId, 95);

    // 11. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl, progress: 100 },
    });
    console.log(`[reddit-video] Done: ${videoUrl}`);

  } catch (err) {
    console.error(`[reddit-video] render failed for ${projectId}:`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
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
    voiceSettings: body.voiceSettings,
    language: body.language,
    showIntroCard: body.showIntroCard ?? true,
    darkMode: body.darkMode ?? true,
    upvotes: body.upvotes ?? "0",
    comments: body.comments ?? "0",
  });

  void markQuestComplete(auth.userId, "first-clip");
  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}
