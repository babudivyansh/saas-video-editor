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
import { markQuestComplete } from "@/lib/quests";
import { renderChatFrame, type CanvasTheme, type CanvasMessage } from "@/utils/chat-canvas";

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
  theme: ThemeColors & { id?: string };
  bgVideoUrl: string;
  receiverVoiceId: string;
  narratorVoiceId: string;
  bgMusicUrl: string;
  voiceSettings?: { stability?: number; style?: number; similarityBoost?: number };
  language?: string;
  avatarBase64?: string;
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
    `drawtext=text='${escapeFfmpegText(contactName)}':x=(w-text_w)/2:y=${Math.round(HEADER_H / 2 - FONT_SIZE / 2 + 2)}:fontsize=${FONT_SIZE + 4}:fontcolor=${hdrText}:font=Arial`,
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
        `drawtext=text='${escapeFfmpegText(lines[l])}':x=${textX}:y=${lineY}:fontsize=${FONT_SIZE}:fontcolor=${textColor}:font=Arial:enable='gte(t,${startSec})'`,
      );
    }

    yPos += bubbleH + GAP;

    // Stop adding bubbles if we reach the bottom of the screen (leaves room for ~3 more)
    if (yPos > 1780) break;
  }

  return filters.join(",");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setProgress(projectId: string, n: number) {
  await prisma.project.update({ where: { id: projectId }, data: { progress: n } }).catch(() => {});
}

const S3_HOST = "saas-video-editor-assets.s3.ap-south-1.amazonaws.com";

// ── Real render pipeline ──────────────────────────────────────────────────────

async function renderTextVideoJob(payload: TextVideoPayload): Promise<void> {
  const { projectId, contactName, messages, theme, bgVideoUrl,
          receiverVoiceId, narratorVoiceId, bgMusicUrl,
          voiceSettings: vs, language } = payload;

  const elevenLabsSettings: import("@/utils/elevenlabs").VoiceSettings | undefined =
    (vs || language) ? {
      stability: vs?.stability,
      style: vs?.style,
      similarityBoost: vs?.similarityBoost,
      languageCode: language && language !== "auto" ? language : undefined,
    } : undefined;

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasAWS = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.AWS_S3_BUCKET;

  if (!hasElevenLabs || !hasAWS) {
    console.warn("[text-video] Missing credentials — simulating render");
    await new Promise(r => setTimeout(r, 3000));
    const fallback = bgVideoUrl || "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/subway-surfers.mp4";
    await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallback } });
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `textvid-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    console.log(`[text-video] Starting render for ${projectId} (${messages.length} messages)`);
    await setProgress(projectId, 5);

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
    await setProgress(projectId, 10);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const voiceId = msg.type === "receiver" ? resolvedReceiverVoice : resolvedNarratorVoice;

      console.log(`[text-video] TTS message ${i + 1}/${messages.length}...`);
      const result = await synthesizeVoice(msg.text, voiceId, elevenLabsSettings);
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
    await setProgress(projectId, 40);

    // 3. Download background video
    console.log("[text-video] Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);
    await setProgress(projectId, 55);

    // 4. Download background music (only from our own S3 — reject third-party CDNs)
    let musicPath: string | undefined;
    if (bgMusicUrl && bgMusicUrl.includes(S3_HOST)) {
      console.log("[text-video] Downloading background music...");
      const candidate = path.join(tmpDir, "music.mp3");
      try {
        await downloadFile(bgMusicUrl, candidate);
        musicPath = candidate;
      } catch (err) {
        console.warn("[text-video] Background music unavailable, continuing without it:", err);
        musicPath = undefined;
      }
    }

    // 5. Render canvas chat frames
    console.log("[text-video] Rendering canvas chat frames...");
    const canvasTheme: CanvasTheme = { ...theme };
    const canvasMessages: CanvasMessage[] = messages.map(m => ({ type: m.type, text: m.text }));

    // Decode avatar if provided
    let avatarBuffer: Buffer | undefined;
    if (payload.avatarBase64) {
      try { avatarBuffer = Buffer.from(payload.avatarBase64, "base64"); } catch { /* ignore */ }
    }

    // Build frame sequence:
    // [init] empty chat (t=0)
    // [typing_i] typing indicator (msgStartMs[i]/1000 - TYPING_DUR)
    // [frame_i]  message i revealed (msgStartMs[i]/1000)
    // Each frame is a full 1080×1920 PNG overlaid with gte(t,T)
    const TYPING_DUR = 0.5; // seconds before each bubble appears

    interface ChatFrame { path: string; startSec: number; }
    const frames: ChatFrame[] = [];

    // Initial empty frame
    const initPath = path.join(tmpDir, "frame_init.png");
    const initBuf = await renderChatFrame([], canvasTheme, contactName, avatarBuffer, false);
    fs.writeFileSync(initPath, initBuf);
    frames.push({ path: initPath, startSec: 0 });

    // Pop sound paths (short 0.08s sine tones mixed at each message start)
    const popPaths: { path: string; delayMs: number }[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msgStart = msgStartMs[i] / 1000;
      const typingStart = Math.max(0, msgStart - TYPING_DUR);

      // Typing frame (only if there's enough gap for it)
      if (typingStart > (frames[frames.length - 1]?.startSec ?? 0) + 0.05) {
        const typingPath = path.join(tmpDir, `frame_typing_${i}.png`);
        const typingBuf = await renderChatFrame(
          canvasMessages.slice(0, i), canvasTheme, contactName, avatarBuffer, true,
        );
        fs.writeFileSync(typingPath, typingBuf);
        frames.push({ path: typingPath, startSec: typingStart });
      }

      // Message revealed frame
      const framePath = path.join(tmpDir, `frame_${i}.png`);
      const frameBuf = await renderChatFrame(
        canvasMessages.slice(0, i + 1), canvasTheme, contactName, avatarBuffer, false,
      );
      fs.writeFileSync(framePath, frameBuf);
      frames.push({ path: framePath, startSec: msgStart });

      // Pop sound for this message
      const popPath = path.join(tmpDir, `pop_${i}.mp3`);
      await runFFmpegArgs([
        "-y", "-f", "lavfi",
        "-i", "sine=frequency=880:duration=0.08",
        "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-q:a", "9",
        popPath,
      ]);
      popPaths.push({ path: popPath, delayMs: msgStartMs[i] });
    }

    await setProgress(projectId, 60);

    // 6. FFmpeg — compose final video with canvas overlay frames
    console.log("[text-video] Running FFmpeg (canvas overlay)...");
    const outputPath = path.join(tmpDir, "output.mp4");

    // Build -filter_complex for sequential overlays (each frame starts at its time and stays until next)
    // Inputs: [0]=bg.mp4, [1]=voice.mp3, [2]=music.mp3 (optional), then PNG frames
    const audioInputIdx = 1;
    const musicInputIdx = musicPath ? 2 : -1;
    const frameBaseIdx = musicPath ? 3 : 2;

    let filterComplex = "";

    // Scale bg to 1080×1920
    filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];`;

    // Overlay frames sequentially — each frame shows from its startSec to the end,
    // but the next frame (with higher startSec) overlays on top and replaces it
    let prevLabel = "bg";
    for (let f = 0; f < frames.length; f++) {
      const inputIdx = frameBaseIdx + f;
      const startSec = frames[f].startSec.toFixed(3);
      const outLabel = f < frames.length - 1 ? `v${f}` : "vout";
      filterComplex += `[${prevLabel}][${inputIdx}:v]overlay=0:0:enable='gte(t,${startSec})':eof_action=pass[${outLabel}];`;
      prevLabel = outLabel;
    }

    // Audio: mix voice + pop sounds, optionally with background music
    const popInputBase = frameBaseIdx + frames.length;
    const popFilters = popPaths.map((p, i) => {
      const inputIdx = popInputBase + i;
      return `[${inputIdx}:a]adelay=${p.delayMs}|${p.delayMs},volume=0.4[pop${i}]`;
    });
    const audioSources = [`[${audioInputIdx}:a]`];
    if (musicPath && musicInputIdx > 0) {
      filterComplex += `[${musicInputIdx}:a]volume=0.12[bgm];`;
      audioSources.push("[bgm]");
    }
    popPaths.forEach((_, i) => {
      filterComplex += popFilters[i] + ";";
      audioSources.push(`[pop${i}]`);
    });

    if (audioSources.length > 1) {
      filterComplex += `${audioSources.join("")}amix=inputs=${audioSources.length}:duration=first:normalize=0[audio]`;
    } else {
      // single audio source — just label it
      filterComplex += `[${audioInputIdx}:a]acopy[audio]`;
    }

    // Build full args list
    const args: string[] = [
      "-y",
      "-stream_loop", "-1", "-i", bgVideoPath,   // 0: bg
      "-i", combinedAudioPath,                     // 1: voice
    ];
    if (musicPath) args.push("-i", musicPath);     // 2: music (optional)
    for (const f of frames) {
      args.push("-loop", "1", "-i", f.path);       // PNG frames
    }
    for (const p of popPaths) {
      args.push("-i", p.path);                     // pop sounds
    }
    args.push(
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "[audio]",
      "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
      "-c:a", "aac", "-shortest",
      outputPath,
    );

    await runFFmpegArgs(args);
    await setProgress(projectId, 90);

    // 7. Upload to S3
    console.log("[text-video] Uploading to S3...");
    const s3Key = `text-videos/${projectId}/output.mp4`;
    const videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");
    await setProgress(projectId, 95);

    // 8. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl, progress: 100 },
    });
    console.log(`[text-video] Done: ${videoUrl}`);

  } catch (err) {
    console.error(`[text-video] render failed for ${projectId}:`, err);
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
    voiceSettings: body.voiceSettings,
    language: body.language,
    avatarBase64: body.avatarBase64,
  });
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: user.credits });
}
