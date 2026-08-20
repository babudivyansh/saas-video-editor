import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { maxUploadBytesForTier, formatBytes } from "@/lib/plans/tiers";
import { prisma } from "@/lib/prisma";
import { InProcessQueue } from "@/lib/job-queue";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { firePostCreditSpendEmails, fireZeroCreditsEmail } from "@/lib/credit-events";
import { synthesizeVoice, WordTiming } from "@/utils/elevenlabs";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { resolveVoiceId } from "@/utils/voice-ids";
import { downloadFile } from "@/utils/download";
import { markQuestComplete } from "@/lib/quests";
import { renderChatFrame, type CanvasTheme, type CanvasMessage } from "@/utils/chat-canvas";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { adoptUploadedBytes, sniffImageMimeType } from "@/lib/asset-service";

// This route's maxDuration used to be unset (unlike every other route in this
// app) — 300s matches its sibling reddit-video/route.ts and the real cost of
// a multi-message TTS+canvas-frame+FFmpeg render.
export const maxDuration = 300;

const CREDIT_COST = 2;
// Each message costs one real ElevenLabs TTS call plus a rendered canvas
// frame, for a flat charge regardless of count — previously uncapped, so a
// user could submit hundreds of messages for the same 2 credits. 40 messages
// comfortably covers a real "text story" video; MAX_MESSAGE_CHARS keeps any
// single bubble from being an essay.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 500;

async function refundRenderCredit(userId: string, generationId?: string) {
  try {
    await refundCredits({ userId, amount: CREDIT_COST, generationId });
    if (generationId) await markGenerationStatus(generationId, "failed", "Render failed");
  } catch (e) {
    logger.error("refund", `failed to refund credit for user ${userId}`, e);
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
  userId: string;
  generationId?: string;
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
  /** An avatar already hosted on our own S3 (reused from the Asset Library) —
   *  mutually exclusive with avatarBase64. Downloaded server-side instead of
   *  round-tripping the image through the client as base64. */
  avatarUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setProgress(projectId: string, n: number) {
  await prisma.project.update({ where: { id: projectId }, data: { progress: n } }).catch(() => {});
}

const S3_HOST = "saas-video-editor-assets.s3.ap-south-1.amazonaws.com";

// ── Real render pipeline ──────────────────────────────────────────────────────

async function renderTextVideoJob(payload: TextVideoPayload): Promise<void> {
  const { projectId, userId, generationId, contactName, messages, theme, bgVideoUrl,
          receiverVoiceId, narratorVoiceId, bgMusicUrl,
          voiceSettings: vs, language } = payload;

  const elevenLabsSettings: import("@/utils/elevenlabs").VoiceSettings | undefined =
    (vs || language) ? {
      stability: vs?.stability,
      style: vs?.style,
      similarityBoost: vs?.similarityBoost,
      languageCode: language && language !== "auto" ? language : undefined,
    } : undefined;

  const hasElevenLabs = !!env.ELEVENLABS_API_KEY;
  const hasAWS = !!env.AWS_ACCESS_KEY_ID && !!env.AWS_SECRET_ACCESS_KEY && !!env.AWS_S3_BUCKET;

  if (!hasElevenLabs || !hasAWS) {
    if (process.env.NODE_ENV === "development") {
      logger.warn("text-video", "Missing credentials — simulating render (dev only)");
      await new Promise(r => setTimeout(r, 3000));
      const fallback = bgVideoUrl || "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/subway-surfers.mp4";
      await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallback } });
      if (generationId) void markGenerationStatus(generationId, "completed");
      return;
    }
    const missing = [!hasElevenLabs && "ELEVENLABS_API_KEY", !hasAWS && "AWS credentials"].filter(Boolean).join(", ");
    logger.error("text-video", `Missing required credentials: ${missing}`);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(userId, generationId);
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `textvid-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    logger.info("text-video", `Starting render for ${projectId} (${messages.length} messages)`);
    await setProgress(projectId, 5);

    const resolvedReceiverVoice = resolveVoiceId(receiverVoiceId);
    const resolvedNarratorVoice = resolveVoiceId(narratorVoiceId);

    // 1. TTS for each message, track start timestamps
    const msgAudioPaths: string[] = [];
    const msgStartMs: number[] = [];

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

      logger.info("text-video", `TTS message ${i + 1}/${messages.length}...`);
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
    logger.info("text-video", "Concatenating audio...");
    const combinedAudioPath = path.join(tmpDir, "voice.mp3");
    await concatAudioFiles(audioPiecesForConcat, combinedAudioPath);
    await setProgress(projectId, 40);

    // 3. Download background video
    logger.info("text-video", "Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);
    await setProgress(projectId, 55);

    // 4. Download background music (only from our own S3 — reject third-party CDNs)
    let musicPath: string | undefined;
    if (bgMusicUrl && bgMusicUrl.includes(S3_HOST)) {
      logger.info("text-video", "Downloading background music...");
      const candidate = path.join(tmpDir, "music.mp3");
      try {
        await downloadFile(bgMusicUrl, candidate);
        musicPath = candidate;
      } catch (err) {
        logger.warn("text-video", "Background music unavailable, continuing without it", err);
        musicPath = undefined;
      }
    }

    // 5. Render canvas chat frames
    logger.info("text-video", "Rendering canvas chat frames...");
    const canvasTheme: CanvasTheme = { ...theme };
    const canvasMessages: CanvasMessage[] = messages.map(m => ({ type: m.type, text: m.text }));

    // Resolve avatar if provided — either a reused Asset (download) or a
    // freshly-uploaded base64 payload (decode). Mutually exclusive; avatarUrl
    // takes precedence since the UI only ever sets one of the two.
    let avatarBuffer: Buffer | undefined;
    if (payload.avatarUrl) {
      try {
        const avatarSrcPath = path.join(tmpDir, "avatar-src");
        await downloadFile(payload.avatarUrl, avatarSrcPath);
        avatarBuffer = fs.readFileSync(avatarSrcPath);
      } catch (e) {
        logger.warn("text-video", "avatar asset download failed, continuing without it", e);
      }
    } else if (payload.avatarBase64) {
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
    logger.info("text-video", "Running FFmpeg (canvas overlay)...");
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
    logger.info("text-video", "Uploading to S3...");
    const s3Key = `text-videos/${projectId}/output.mp4`;
    const videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");
    await setProgress(projectId, 95);

    // 8. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl, progress: 100 },
    });
    if (generationId) void markGenerationStatus(generationId, "completed");
    logger.info("text-video", `Done: ${videoUrl}`);

  } catch (err) {
    logger.error("text-video", `render failed for ${projectId}`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
    await refundRenderCredit(userId, generationId);
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

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<TextVideoPayload> & { idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.projectId || !body.messages?.length || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId, messages, and bgVideoUrl required" }, { status: 400 });
  }
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `Too many messages (max ${MAX_MESSAGES})` }, { status: 400 });
  }
  const tooLong = body.messages.find(m => (m.text?.length ?? 0) > MAX_MESSAGE_CHARS);
  if (tooLong) {
    return NextResponse.json({ error: `Each message must be under ${MAX_MESSAGE_CHARS} characters` }, { status: 400 });
  }

  // Reject an oversized/malformed avatar payload before charging credits or
  // starting the render — previously this only surfaced deep inside the
  // render job (loadImage() on a bad buffer), wasting a full TTS+FFmpeg
  // pass and a charge/refund cycle on something checkable up front.
  //
  // The cap is the user's actual plan upload limit (same as every other
  // avatar/Asset-library path), not a flat number — previously hardcoded at
  // 10MB regardless of tier, which would reject a Pro/Studio avatar that
  // adoptUploadedBytes below would otherwise happily accept (Upload Limits
  // Audit §15 pattern, applied here too since this is the same "avatar image"
  // category as the other flows already fixed).
  const avatarTier = await getUserTier(auth.userId);
  const maxAvatarBytes = maxUploadBytesForTier(avatarTier);
  let avatarBuffer: Buffer | undefined;
  // avatarUrl (an asset reused from the library) is downloaded server-side
  // inside the render job, not here — but it must be constrained to our own
  // storage host, same as the bgMusicUrl check below, since it's otherwise a
  // client-controlled URL the server would fetch (SSRF).
  if (body.avatarUrl && !body.avatarUrl.includes(S3_HOST)) {
    return NextResponse.json({ error: "Invalid avatar source" }, { status: 400 });
  }
  if (!body.avatarUrl && body.avatarBase64) {
    try {
      avatarBuffer = Buffer.from(body.avatarBase64, "base64");
    } catch {
      return NextResponse.json({ error: "Invalid avatar image data" }, { status: 400 });
    }
    if (avatarBuffer.length === 0 || avatarBuffer.length > maxAvatarBytes) {
      return NextResponse.json({ error: `Avatar image must be under ${formatBytes(maxAvatarBytes)}` }, { status: 413 });
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Global Asset Library: the avatar is a genuine user input, previously only
  // ever kept in memory for the render. Persist it (best-effort, fire-and-
  // forget — never blocks or fails video generation) so it shows up in Assets
  // and can be reused. The base64 payload carries no Content-Type, so this
  // sniffs the format from magic bytes rather than guessing.
  if (avatarBuffer) {
    const mimeType = sniffImageMimeType(avatarBuffer);
    if (mimeType) {
      adoptUploadedBytes({
        userId: auth.userId,
        bytes: avatarBuffer,
        mimeType,
        name: "avatar",
        sourceFeature: "text-video",
        sourceProjectId: body.projectId,
      }).catch((e) => {
        logger.warn("text-video", "best-effort avatar asset adoption failed", { reason: (e as Error).message });
      });
    }
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "text-video",
    idempotencyKey: body.idempotencyKey,
    log: { generationType: "video" },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Text Video Generator is temporarily disabled." }, { status: 503 });
    }
    fireZeroCreditsEmail(auth.userId);
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  firePostCreditSpendEmails(auth.userId, charge.balance);

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
    userId: auth.userId,
    generationId: charge.generationId,
    contactName: body.contactName || "Contact",
    messages: body.messages,
    theme: body.theme || defaultTheme,
    bgVideoUrl: body.bgVideoUrl,
    receiverVoiceId: body.receiverVoiceId || "william",
    narratorVoiceId: body.narratorVoiceId || "william",
    bgMusicUrl: body.bgMusicUrl || "",
    voiceSettings: body.voiceSettings,
    language: body.language,
    avatarBase64: body.avatarUrl ? undefined : body.avatarBase64,
    avatarUrl: body.avatarUrl,
  });
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ status: "rendering", creditsRemaining: charge.balance });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:text-video" });
