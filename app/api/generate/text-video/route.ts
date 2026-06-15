import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { InProcessQueue } from "@/lib/job-queue";
import { synthesizeVoice, WordTiming } from "@/utils/elevenlabs";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { resolveVoiceId } from "@/utils/voice-ids";
import { downloadFile } from "@/utils/download";

const CREDIT_COST = 1;

interface Message {
  type: "receiver" | "sender";
  text: string;
}

interface ThemeColors {
  bg: string;
  headerBg: string;
  headerText: string;
  receiverBubble: string;
  receiverText: string;
  senderBubble: string;
  senderText: string;
}

interface TextVideoPayload {
  projectId: string;
  contactName: string;
  messages: Message[];
  theme: ThemeColors;
  bgVideoUrl: string;
  receiverVoiceId: string;
  narratorVoiceId: string;
  bgMusicUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToFfmpeg(hex: string): string {
  return `0x${hex.replace("#", "")}`;
}

function escapeFfmpegText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")  // replace apostrophe with curly quote to avoid escaping issues
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/=/g, "\\=");
}

function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function getTtsDurationMs(wordTimings: WordTiming[]): number {
  if (!wordTimings.length) return 0;
  return wordTimings[wordTimings.length - 1].end;
}

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

// ── Chat overlay FFmpeg filter builder ────────────────────────────────────────

function buildChatFilter(
  messages: Message[],
  msgStartMs: number[],
  contactName: string,
  theme: ThemeColors,
): string {
  const BUBBLE_W = 620;
  const FONT_SIZE = 34;
  const LINE_H = 44;
  const PAD_X = 20;
  const PAD_Y = 13;
  const GAP = 12;
  const MAX_CHARS = 26;
  const HEADER_H = 115;

  const bgColor    = hexToFfmpeg(theme.bg) + "@0.93";
  const hdrColor   = hexToFfmpeg(theme.headerBg);
  const hdrText    = hexToFfmpeg(theme.headerText);

  const filters: string[] = [
    // Crop to 9:16 portrait
    "crop=in_h*9/16:in_h",
    // Full-screen chat background
    `drawbox=x=0:y=0:w=iw:h=ih:color=${bgColor}:t=fill`,
    // Header background
    `drawbox=x=0:y=0:w=iw:h=${HEADER_H}:color=${hdrColor}:t=fill`,
    // Contact name in header
    `drawtext=text='${escapeFfmpegText(contactName)}':x=(w-text_w)/2:y=${Math.round(HEADER_H / 2 - FONT_SIZE / 2 + 2)}:fontsize=${FONT_SIZE + 4}:fontcolor=${hdrText}:fontname=Arial`,
  ];

  let yPos = HEADER_H + 16;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const lines = wordWrap(msg.text, MAX_CHARS);
    const bubbleH = lines.length * LINE_H + PAD_Y * 2;
    const startSec = (msgStartMs[i] / 1000).toFixed(3);

    const isReceiver = msg.type === "receiver";
    const bubbleX = isReceiver ? 20 : (1080 - 20 - BUBBLE_W);
    const textX = bubbleX + PAD_X;
    const bubbleColor = hexToFfmpeg(isReceiver ? theme.receiverBubble : theme.senderBubble);
    const textColor   = hexToFfmpeg(isReceiver ? theme.receiverText   : theme.senderText);

    filters.push(
      `drawbox=x=${bubbleX}:y=${yPos}:w=${BUBBLE_W}:h=${bubbleH}:color=${bubbleColor}:t=fill:enable='gte(t,${startSec})'`,
    );

    for (let l = 0; l < lines.length; l++) {
      const lineY = yPos + PAD_Y + l * LINE_H;
      filters.push(
        `drawtext=text='${escapeFfmpegText(lines[l])}':x=${textX}:y=${lineY}:fontsize=${FONT_SIZE}:fontcolor=${textColor}:fontname=Arial:enable='gte(t,${startSec})'`,
      );
    }

    yPos += bubbleH + GAP;

    // Stop adding bubbles if we reach the bottom of the screen (leaves room for ~3 more)
    if (yPos > 1780) break;
  }

  return filters.join(",");
}

// ── Real render pipeline ──────────────────────────────────────────────────────

async function renderTextVideoJob(payload: TextVideoPayload): Promise<void> {
  const { projectId, contactName, messages, theme, bgVideoUrl,
          receiverVoiceId, narratorVoiceId, bgMusicUrl } = payload;

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasAWS = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_S3_BUCKET;

  if (!hasElevenLabs || !hasAWS) {
    console.warn("[text-video] Missing credentials — simulating render");
    await new Promise(r => setTimeout(r, 3000));
    const fallback = bgVideoUrl || "https://gameplay-cdn.com/gameplay/12dm7zdo-qhr4-9ro5-xb9p-794xmqsudvi/video.mp4";
    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallback } });
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `textvid-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    console.log(`[text-video] Starting render for ${projectId} (${messages.length} messages)`);

    const resolvedReceiverVoice = resolveVoiceId(receiverVoiceId);
    const resolvedNarratorVoice = resolveVoiceId(narratorVoiceId);

    // 1. TTS for each message, track start timestamps
    const msgAudioPaths: string[] = [];
    const msgStartMs: number[] = [];
    const silencePaths: string[] = [];

    // 300ms silence gap between messages
    const GAP_MS = 300;
    const silencePath = path.join(tmpDir, "gap.mp3");
    await runFFmpegArgs([
      "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "0.3", "-c:a", "libmp3lame", "-q:a", "3", silencePath,
    ]);

    let cursorMs = 0;
    const audioPiecesForConcat: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const voiceId = msg.type === "receiver" ? resolvedReceiverVoice : resolvedNarratorVoice;

      console.log(`[text-video] TTS message ${i + 1}/${messages.length}...`);
      const result = await synthesizeVoice(msg.text, voiceId);
      const audioPath = path.join(tmpDir, `msg_${i}.mp3`);
      fs.writeFileSync(audioPath, result.audioBuffer);

      msgStartMs.push(cursorMs);
      msgAudioPaths.push(audioPath);
      audioPiecesForConcat.push(audioPath);

      cursorMs += getTtsDurationMs(result.wordTimings);

      // Add gap after every message except the last
      if (i < messages.length - 1) {
        audioPiecesForConcat.push(silencePath);
        cursorMs += GAP_MS;
      }
    }

    // 2. Concatenate all message audio
    console.log("[text-video] Concatenating audio...");
    const combinedAudioPath = path.join(tmpDir, "voice.mp3");
    await concatAudioFiles(audioPiecesForConcat, combinedAudioPath);

    // 3. Download background video
    console.log("[text-video] Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);

    // 4. Download background music (optional)
    let musicPath: string | undefined;
    if (bgMusicUrl) {
      console.log("[text-video] Downloading background music...");
      musicPath = path.join(tmpDir, "music.mp3");
      await downloadFile(bgMusicUrl, musicPath);
    }

    // 5. Build chat overlay video filter
    console.log("[text-video] Building chat overlay filter...");
    const chatFilter = buildChatFilter(messages, msgStartMs, contactName, theme);

    // 6. FFmpeg — compose final video
    console.log("[text-video] Running FFmpeg...");
    const outputPath = path.join(tmpDir, "output.mp4");

    let args: string[];
    if (musicPath) {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", combinedAudioPath,
        "-i", musicPath,
        "-filter_complex",
        `[2:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio];[0:v]${chatFilter}[video]`,
        "-map", "[video]",
        "-map", "[audio]",
        "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
        "-c:a", "aac", "-shortest",
        outputPath,
      ];
    } else {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", combinedAudioPath,
        "-filter_complex",
        `[0:v]${chatFilter}[video]`,
        "-map", "[video]",
        "-map", "1:a",
        "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
        "-c:a", "aac", "-shortest",
        outputPath,
      ];
    }

    await runFFmpegArgs(args);

    // 7. Upload to S3
    console.log("[text-video] Uploading to S3...");
    const s3Key = `text-videos/${projectId}/output.mp4`;
    const videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");

    // 8. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl },
    });
    console.log(`[text-video] Done: ${videoUrl}`);

  } catch (err) {
    console.error(`[text-video] render failed for ${projectId}:`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────

let _queue: InProcessQueue<TextVideoPayload> | null = null;
function getQueue() {
  if (!_queue) _queue = new InProcessQueue<TextVideoPayload>("text-video", renderTextVideoJob);
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

  const body = await req.json() as Partial<TextVideoPayload>;
  if (!body.projectId || !body.messages?.length || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId, messages, and bgVideoUrl required" }, { status: 400 });
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

  const defaultTheme: ThemeColors = {
    bg: "#1C1C1E", headerBg: "#1C1C1E", headerText: "#ffffff",
    receiverBubble: "#2C2C2E", receiverText: "#ffffff",
    senderBubble: "#147EFB", senderText: "#ffffff",
  };

  await prisma.project.update({
    where: { id: body.projectId },
    data: {
      status: "rendering",
      backgroundUrl: body.bgVideoUrl,
      musicUrl: body.bgMusicUrl || null,
      voiceId: body.receiverVoiceId || "william",
    },
  });

  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    contactName: body.contactName || "Contact",
    messages: body.messages,
    theme: body.theme || defaultTheme,
    bgVideoUrl: body.bgVideoUrl,
    receiverVoiceId: body.receiverVoiceId || "william",
    narratorVoiceId: body.narratorVoiceId || "william",
    bgMusicUrl: body.bgMusicUrl || "",
  });

  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}
