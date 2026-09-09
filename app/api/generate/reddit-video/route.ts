import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InProcessQueue } from "@/lib/job-queue";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { synthesizeVoice, WordTiming } from "@/utils/elevenlabs";
import { generateASS, runFFmpeg, runFFmpegArgs } from "@/utils/ffmpeg-render";
import { resolveSurfaceCaptionStyle } from "@/lib/captions/surfaceStyle";
import { resolveCaptionCreateInput } from "@/lib/captions/createPayload";
import { planSurfaceCaptions, requestSurfaceCaptionRender } from "@/lib/captions/surfaceRender";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { resolveVoiceId } from "@/utils/voice-ids";
import { downloadFile } from "@/utils/download";
import { markQuestComplete } from "@/lib/quests";
import { renderRedditCard } from "@/utils/reddit-canvas";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

const CREDIT_COST = 2;
const MAX_SCRIPT_CHARS = 5000;
const S3_HOST = "saas-video-editor-assets.s3.ap-south-1.amazonaws.com";

async function refundRenderCredit(userId: string, generationId?: string) {
  try {
    await refundCredits({ userId, amount: CREDIT_COST, generationId });
    if (generationId) await markGenerationStatus(generationId, "failed", "Render failed");
  } catch (e) {
    logger.error("refund", `failed to refund credit for user ${userId}`, e);
  }
}

async function setProgress(projectId: string, n: number) {
  await prisma.project.update({ where: { id: projectId }, data: { progress: n } }).catch(() => {});
}

interface RedditVideoPayload {
  projectId: string;
  userId: string;
  generationId?: string;
  postTitle: string;
  username: string;
  script: string;
  introVoiceId: string;
  scriptVoiceId: string;
  bgMusicUrl: string;
  bgVideoUrl: string;
  /** Legacy index. Kept so an in-flight job still renders its chosen look. */
  subtitleStyleIndex: number;
  /** Template slug — authoritative when set. */
  captionTemplateId?: string | null;
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
    projectId, userId, generationId, postTitle, username, script, introVoiceId, scriptVoiceId,
    bgMusicUrl, bgVideoUrl, subtitleStyleIndex, captionTemplateId, subtitleMode,
    voiceSettings: vs, language, showIntroCard = true, darkMode = true,
    upvotes = "0", comments = "0",
  } = payload;

  const hasElevenLabs = !!env.ELEVENLABS_API_KEY;
  const hasAWS = !!env.AWS_ACCESS_KEY_ID && !!env.AWS_SECRET_ACCESS_KEY && !!env.AWS_S3_BUCKET;

  if (!hasElevenLabs || !hasAWS) {
    if (process.env.NODE_ENV === "development") {
      logger.warn("reddit-video", "Missing credentials — simulating render (dev only)");
      await new Promise(r => setTimeout(r, 3000));
      const fallbackUrl = bgVideoUrl || "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds/subway-surfers.mp4";
      await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: fallbackUrl, progress: 100 } });
      if (generationId) void markGenerationStatus(generationId, "completed");
      return;
    }
    const missing = [!hasElevenLabs && "ELEVENLABS_API_KEY", !hasAWS && "AWS credentials"].filter(Boolean).join(", ");
    logger.error("reddit-video", `Missing required credentials: ${missing}`);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(userId, generationId);
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `reddit-${projectId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await setProgress(projectId, 5);
    logger.info("reddit-video", `Starting render for ${projectId}`);

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

    logger.info("reddit-video", "Generating intro TTS...");
    const introResult = await synthesizeVoice(introText, resolvedIntroId, elevenLabsSettings);
    const introAudioPath = path.join(tmpDir, "intro.mp3");
    fs.writeFileSync(introAudioPath, introResult.audioBuffer);
    const introDurationMs = getTtsDurationMs(introResult.wordTimings);
    await setProgress(projectId, 10);

    // 2. TTS — main script
    logger.info("reddit-video", "Generating script TTS...");
    const scriptResult = await synthesizeVoice(script, resolvedScriptId, elevenLabsSettings);
    const scriptAudioPath = path.join(tmpDir, "script.mp3");
    fs.writeFileSync(scriptAudioPath, scriptResult.audioBuffer);
    await setProgress(projectId, 25);

    // 3. Concatenate audio (intro + 500ms gap + script)
    logger.info("reddit-video", "Concatenating audio...");
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
    logger.info("reddit-video", "Generating subtitles...");
    const subtitleStyle = resolveSurfaceCaptionStyle({
      templateId: captionTemplateId,
      styleIndex: subtitleStyleIndex,
      mode: subtitleMode,
      words: combinedTimings,
    });
    const assPath = path.join(tmpDir, "subs.ass");
    generateASS(combinedTimings, subtitleStyle, assPath);

    // With a premium template a provider captions the finished file, so this
    // composite has to come out CLEAN — otherwise the export carries two
    // caption tracks, ours underneath theirs.
    // Derived from the word timings themselves — the same source the intro
    // duration comes from — rather than probing a file that doesn't exist yet.
    const durationSec = (combinedTimings.at(-1)?.end ?? introDurationMs + gapMs) / 1000;
    const plan = await planSurfaceCaptions({ projectId, userId, templateId: captionTemplateId, durationSec });

    // 6. Render Reddit card PNG (optional)
    let introCardPath: string | undefined;
    if (showIntroCard) {
      logger.info("reddit-video", "Rendering Reddit intro card...");
      const cardBuf = await renderRedditCard({ postTitle, username, upvotes, comments, darkMode });
      introCardPath = path.join(tmpDir, "reddit_card.png");
      fs.writeFileSync(introCardPath, cardBuf);
    }

    // 7. Download background video
    logger.info("reddit-video", "Downloading background video...");
    const bgVideoPath = path.join(tmpDir, "bg.mp4");
    await downloadFile(bgVideoUrl, bgVideoPath);
    await setProgress(projectId, 55);

    // 8. Download background music (only from our S3 — reject 3rd-party CDNs)
    let musicPath: string | undefined;
    if (bgMusicUrl && bgMusicUrl.includes(S3_HOST)) {
      logger.info("reddit-video", "Downloading background music...");
      const candidate = path.join(tmpDir, "music.mp3");
      try {
        await downloadFile(bgMusicUrl, candidate);
        musicPath = candidate;
      } catch (err) {
        logger.warn("reddit-video", "Background music unavailable, continuing without it", err);
      }
    }
    await setProgress(projectId, 60);

    // 9. FFmpeg — compose final video
    logger.info("reddit-video", "Running FFmpeg...");
    const outputPath = path.join(tmpDir, "output.mp4");

    // One composite, two callers: the normal pass, and the fallback pass that
    // burns captions locally when the provider declines after the fact.
    const compose = async (burnSubs: boolean) => {
      if (introCardPath) {
        // Build a custom filter_complex that overlays the Reddit card during intro narration
        const introDurSec = ((introDurationMs + gapMs) / 1000).toFixed(3);
        const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        // `null` is a pass-through: same graph shape either way, so the labels
        // downstream don't have to change with the caption decision.
        const subsNode = burnSubs ? `subtitles='${assEscaped}'` : "null";

        const musicInputIdx = musicPath ? 3 : -1;
        const cardInputIdx = musicPath ? 4 : 3;

        let filterComplex = "";
        // Scale BG video to 1080×1920
        filterComplex += `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];`;
        // Overlay Reddit card during intro window
        filterComplex += `[bg][${cardInputIdx}:v]overlay=0:0:enable='lte(t,${introDurSec})'[withcard];`;
        filterComplex += `[withcard]${subsNode}[video]`;

        // Audio mixing
        if (musicPath && musicInputIdx > 0) {
          filterComplex += `;[${musicInputIdx}:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio]`;
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
        return;
      }
      // No intro card — use simple runFFmpeg helper
      await runFFmpeg({
        bgVideoPath,
        voiceAudioPath: combinedAudioPath,
        musicAudioPath: musicPath,
        assPath: burnSubs ? assPath : undefined,
        outputPath,
      });
    };

    await compose(!plan.defer);

    await setProgress(projectId, 90);

    // 10. Upload to S3
    logger.info("reddit-video", "Uploading to S3...");
    const s3Key = `reddit-videos/${projectId}/output.mp4`;
    let videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");

    if (plan.defer && captionTemplateId) {
      // The words handed to the provider are ElevenLabs' alignment of the
      // script the USER typed — exact text, usernames and post titles included.
      // Pushing them before the paid export is what stops a premium render from
      // replacing that with an ASR guess at our own synthesized audio.
      const outcome = await requestSurfaceCaptionRender({
        projectId, userId, templateId: captionTemplateId, durationSec, words: combinedTimings,
      });
      if (!outcome.submitted) {
        logger.warn("reddit-video", `provider declined (${outcome.reason}) — burning captions locally for ${projectId}`);
        await compose(true);
        videoUrl = await uploadFileToS3(outputPath, s3Key, "video/mp4");
      }
    }

    await setProgress(projectId, 95);

    // 11. Mark complete
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl, progress: 100 },
    });
    if (generationId) void markGenerationStatus(generationId, "completed");
    logger.info("reddit-video", `Done: ${videoUrl}`);

  } catch (err) {
    logger.error("reddit-video", `render failed for ${projectId}`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    await refundRenderCredit(userId, generationId);
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

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<RedditVideoPayload> & { idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.projectId || !body.script || !body.bgVideoUrl) {
    return NextResponse.json({ error: "projectId, script, and bgVideoUrl required" }, { status: 400 });
  }
  if (body.script.length > MAX_SCRIPT_CHARS) {
    return NextResponse.json({ error: `Script is too long (max ${MAX_SCRIPT_CHARS} characters)` }, { status: 400 });
  }

  // Shared with the AutoClip create routes. Worth noting what it fixes here:
  // this page's picker offered 20 one-word tiles while the style table defines
  // 16, so tiles 16-19 all silently rendered as tile 15. A slug cannot be out
  // of range, and the legacy index is now clamped rather than clamped-by-accident.
  const caption = resolveCaptionCreateInput({
    captionStyleIndex: body.subtitleStyleIndex,
    captionTemplateId: body.captionTemplateId,
  });

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: auth.userId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "reddit-video",
    idempotencyKey: body.idempotencyKey,
    log: { generationType: "video", prompt: body.script },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Reddit Video Generator is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  await prisma.project.update({
    where: { id: body.projectId },
    data: {
      status: "rendering",
      script: body.script,
      voiceId: body.scriptVoiceId || "",
      musicUrl: body.bgMusicUrl || null,
      backgroundUrl: body.bgVideoUrl,
      subtitlesStyle: { styleIndex: caption.captionStyleIndex, templateId: caption.templateId, mode: body.subtitleMode ?? "oneword" },
    },
  });

  getQueue().enqueue(body.projectId, {
    projectId: body.projectId,
    userId: auth.userId,
    generationId: charge.generationId,
    postTitle: body.postTitle || project.title || "",
    username: body.username || "AskReddit",
    script: body.script,
    introVoiceId: body.introVoiceId || "william",
    scriptVoiceId: body.scriptVoiceId || "william",
    bgMusicUrl: body.bgMusicUrl || "",
    bgVideoUrl: body.bgVideoUrl,
    subtitleStyleIndex: caption.captionStyleIndex,
    captionTemplateId: caption.templateId,
    subtitleMode: body.subtitleMode ?? "oneword",
    voiceSettings: body.voiceSettings,
    language: body.language,
    showIntroCard: body.showIntroCard ?? true,
    darkMode: body.darkMode ?? true,
    upvotes: body.upvotes ?? "0",
    comments: body.comments ?? "0",
  });

  void markQuestComplete(auth.userId, "first-clip");
  return NextResponse.json({ status: "rendering", creditsRemaining: charge.balance });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:reddit-video" });
