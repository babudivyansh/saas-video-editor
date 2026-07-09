// AutoClip pipeline (pick -> review -> render -> re-render). Job functions
// live here (not in the route files) so both the initial route and the
// confirm/rerender endpoints can share them, following the same pattern as
// lib/editor/render-job.ts + app/api/editor/render/route.ts. Each route file
// owns its own `createRenderQueue(...)` call.

import { Prisma, type Clip } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { downloadFile } from "@/utils/download";
import {
  extractAudio,
  runFFmpegArgs,
  runFFmpegWithProgress,
  getMediaDurationSec,
  getMediaDimensions,
  analyzeAudio,
  generateASS,
  styleIndexToSubtitleStyle,
} from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { transcribeAudio, type WordTiming } from "@/utils/elevenlabs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/editor/types";
import {
  detectFaceTimeline,
  computeCropKeyframesForClip,
  computeMultiSpeakerKeyframes,
  buildDynamicCropFilter,
  buildSplitScreenFilterComplex,
  buildZoomEnvelope,
  type FaceBox,
  type StoredCrop,
} from "@/lib/reframe";
import { calibrateScore, type SubScores } from "@/lib/virality-score";
import { computeBrollWindow, pickBroll } from "@/lib/broll";
import { TARGET_RES } from "@/lib/reframe";
import os from "os";
import path from "path";
import fs from "fs";

export type Aspect = "9:16" | "16:9" | "1:1";

function aspectRatioFilter(ratio: Aspect): string {
  switch (ratio) {
    case "9:16": return "crop=in_h*9/16:in_h";
    case "16:9": return "crop=in_w:in_w*9/16";
    case "1:1":  return "crop=in_h:in_h";
  }
}

const MOODS = ["energetic", "calm", "dramatic", "funny", "neutral"] as const;
type MoodTag = typeof MOODS[number];
const MOOD_TO_FILTER: Record<MoodTag, FilterPreset> = {
  energetic: "vivid", calm: "softGlow", dramatic: "noir", funny: "warm", neutral: "none",
};

// ── Credits (P2.6) ───────────────────────────────────────────────────────
// Replaces the old flat 2-credit charge, which cost the same whether the user
// asked for 1 short clip or 20 long ones. Rates are admin-adjustable via the
// Config table (see getAutoClipPricing) instead of hardcoded — nobody here
// can responsibly invent final prices, but the numbers should at least be a
// business decision made through an admin control, not a code deploy.

export interface AutoClipPricing {
  base: number;
  perExtraClip: number;
  perMinute: number;
  rerender: number;
}

export const AUTOCLIP_PRICING_DEFAULTS: AutoClipPricing = {
  base: 1, perExtraClip: 1, perMinute: 1, rerender: 1,
};

export async function getAutoClipPricing(): Promise<AutoClipPricing> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "autoclip_pricing" } });
    if (!row) return AUTOCLIP_PRICING_DEFAULTS;
    const parsed = JSON.parse(row.value) as Partial<AutoClipPricing>;
    return { ...AUTOCLIP_PRICING_DEFAULTS, ...parsed };
  } catch {
    return AUTOCLIP_PRICING_DEFAULTS;
  }
}

export function computeCreditCost(clipCount: number, totalDurationSec: number, pricing: AutoClipPricing): number {
  const extraClips = Math.max(0, clipCount - 1);
  const minutes = Math.ceil(totalDurationSec / 60);
  return pricing.base + extraClips * pricing.perExtraClip + minutes * pricing.perMinute;
}

export async function refundCredits(projectId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    await prisma.user.update({ where: { id: proj.userId }, data: { credits: { increment: amount } } });
    const cached = await redis.get(`credits:${proj.userId}`);
    if (cached !== null) {
      await redis.set(`credits:${proj.userId}`, String(parseInt(cached, 10) + amount), "EX", 3600);
    }
  } catch (e) {
    logger.error("auto-clip", `failed to refund ${amount} credits for project ${projectId}`, e);
  }
}

// ── Word-timing slicing (P0.3) ──────────────────────────────────────────────

export function sliceWordsForClip(words: WordTiming[], startSec: number, endSec: number): WordTiming[] {
  const startMs = startSec * 1000, endMs = endSec * 1000;
  return words
    .filter((w) => w.end > startMs && w.start < endMs)
    .map((w) => ({ word: w.word, start: Math.max(0, w.start - startMs), end: Math.max(0, w.end - startMs) }));
}

// A clip's transcriptJson is stored relative to the clip's own start (not the
// full video), so it can't be re-sliced from an absolute timeline once that's
// discarded after the pick job. When a re-render (P1.3) changes start/end, we
// can still shift+re-filter the already-sliced words — this covers trims
// within the original window; words in a newly-*extended* portion beyond the
// original start/end were never captured and are simply absent (no captions
// there) rather than fabricated.
export function rebaseClipWords(words: WordTiming[], oldStartSec: number, newStartSec: number, newEndSec: number): WordTiming[] {
  const shiftMs = (newStartSec - oldStartSec) * 1000;
  const newDurationMs = (newEndSec - newStartSec) * 1000;
  return words
    .map((w) => ({ word: w.word, start: w.start - shiftMs, end: w.end - shiftMs }))
    .filter((w) => w.end > 0 && w.start < newDurationMs)
    .map((w) => ({ word: w.word, start: Math.max(0, w.start), end: Math.min(newDurationMs, w.end) }));
}

// ── Gemini highlight selection (P2.4 — structured sub-scores + mood) ───────

interface GeminiSegment {
  start: number; end: number; title: string;
  hook: number; pacing: number; payoff: number; engagement: number;
  mood: MoodTag;
  brollQuery: string | null;
}

async function getClipsFromGemini(
  transcriptText: string,
  durationSec: number,
  clipCount: number,
  minDuration: number,
  maxDuration: number,
  instructions: string,
): Promise<GeminiSegment[]> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const hasTranscript = transcriptText.trim().length > 0;

  const sharedRules = `Return ONLY a valid JSON array — no explanation, no markdown fences. Example:
[{"start":12.5,"end":35.0,"title":"The mistake everyone makes","hook":87,"pacing":75,"payoff":80,"engagement":82,"mood":"energetic","brollQuery":"city traffic at night"}]

For each clip include:
- "title": a short, punchy, scroll-stopping hook (max 60 characters), no quotes inside
- "hook": 0-99, how strong/attention-grabbing the first 2 seconds are
- "pacing": 0-99, how tight and well-paced the clip is (no dead air, no rambling)
- "payoff": 0-99, whether the clip has a clear punchline, insight, or resolution
- "engagement": 0-99, overall predicted engagement if posted to TikTok/Reels/Shorts
- "mood": one of "energetic", "calm", "dramatic", "funny", "neutral" — the dominant emotional tone
- "brollQuery": a short 2-4 word visual search term for stock B-roll footage that could briefly illustrate a moment partway through this clip (e.g. "city traffic", "coffee pouring"), or null if this clip doesn't have a natural B-roll opportunity — a reaction/punchline moment or a clip that should stay on the original footage the whole time

Rules:
- Return exactly ${clipCount} clip(s)
- Each clip between ${minDuration}s and ${maxDuration}s long
- Clips must not overlap
- start/end within 0 and ${durationSec.toFixed(1)}
- Sort by start time ascending
- Favor clips that stand alone without needing earlier context, and that end on a complete thought`;

  const prompt = hasTranscript
    ? `You are a viral video editor. Analyze this transcript and select the ${clipCount} most engaging, self-contained clips.

Each clip must be between ${minDuration} and ${maxDuration} seconds long.
${instructions ? `User instructions: ${instructions}` : "Focus on the most engaging, entertaining, or high-energy moments — prioritize a clear beginning and end (a complete thought, joke, or story) over arbitrary time slices."}

Video duration: ${durationSec.toFixed(1)} seconds

Transcript (format: [seconds] word):
${transcriptText}

${sharedRules}`
    : `You are a viral video editor. Select ${clipCount} clips from a ${durationSec.toFixed(1)}-second video.

Each clip must be between ${minDuration} and ${maxDuration} seconds long.
${instructions ? `User instructions: ${instructions}` : "Space clips across the video to capture a variety of moments."}
Note: no transcript is available, so these picks are not grounded in actual audio/video content — space them out reasonably.

${sharedRules}`;

  const result = await withRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 30_000 });
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON array");

  const raw = JSON.parse(jsonMatch[0]) as Array<{
    start: number; end: number; title?: string;
    hook?: number; pacing?: number; payoff?: number; engagement?: number; mood?: string;
    brollQuery?: string | null;
  }>;
  const clampSub = (n: unknown) => Math.max(0, Math.min(99, Math.round(typeof n === "number" ? n : 50)));

  return raw
    .filter((c) => typeof c.start === "number" && typeof c.end === "number" && c.end > c.start)
    .map((c, i) => ({
      start: Math.max(0, Math.min(c.start, durationSec - 1)),
      end: Math.min(c.end, durationSec),
      title: (typeof c.title === "string" && c.title.trim()) ? c.title.trim().slice(0, 80) : `Clip ${i + 1}`,
      hook: clampSub(c.hook), pacing: clampSub(c.pacing), payoff: clampSub(c.payoff), engagement: clampSub(c.engagement),
      mood: (MOODS as readonly string[]).includes(c.mood ?? "") ? (c.mood as MoodTag) : "neutral",
      brollQuery: (typeof c.brollQuery === "string" && c.brollQuery.trim()) ? c.brollQuery.trim().slice(0, 60) : null,
    }))
    .slice(0, clipCount);
}

// Decides which reframe strategy a clip gets, in priority order: two-speaker
// split-screen (only for 9:16, only when the face timeline genuinely shows
// two consistently-separated people) > single-speaker pan > a mild zoom
// envelope for energetic/dramatic clips with no usable face signal > nothing
// (falls back to the existing static center crop at render time).
function computeStoredCrop(
  allFaces: FaceBox[],
  seg: GeminiSegment,
  aspectRatio: Aspect,
  srcW: number,
  srcH: number,
): StoredCrop | null {
  if (srcW <= 0 || srcH <= 0) return null;

  if (aspectRatio === "9:16" && allFaces.length > 0) {
    const multi = computeMultiSpeakerKeyframes(allFaces, seg.start, seg.end, srcW, srcH);
    if (multi) return { mode: "split", a: multi.a, b: multi.b };
  }
  if (allFaces.length > 0) {
    const single = computeCropKeyframesForClip(allFaces, seg.start, seg.end, aspectRatio, srcW, srcH);
    if (single) return { mode: "single", keyframes: single };
  }
  if (seg.mood === "energetic" || seg.mood === "dramatic") {
    return { mode: "single", keyframes: buildZoomEnvelope(seg.end - seg.start, aspectRatio, srcW, srcH) };
  }
  return null;
}

// ── Phase 1: pick (analyze video, propose clips, no rendering/credits yet) ─

export interface PickPayload {
  projectId: string;
  minDuration: number;
  maxDuration: number;
  clipCount: number;
  aspectRatio: Aspect;
  instructions: string;
  captionStyleIndex: number; // -1 = captions off
}

export async function pickJob(payload: PickPayload): Promise<void> {
  const { projectId, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionStyleIndex } = payload;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) throw new Error(`Project ${projectId} missing uploadedVideoUrl`);

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src.mp4`);
  const audioPath = path.join(tmp, `${projectId}-audio.mp3`);

  try {
    await downloadFile(project.uploadedVideoUrl, videoPath);
    const durationSec = await getMediaDurationSec(videoPath);
    if (durationSec < minDuration) {
      throw new Error(`Video is too short (${durationSec.toFixed(1)}s) for the requested clip duration (min ${minDuration}s)`);
    }

    let wordTimings: WordTiming[] = [];
    let sttFailed = false;
    try {
      await extractAudio(videoPath, audioPath);
      wordTimings = await transcribeAudio(fs.readFileSync(audioPath)); // retries internally, see utils/elevenlabs.ts
    } catch (err) {
      sttFailed = true;
      logger.warn("auto-clip", "transcription failed, Gemini will work without transcript", err);
    }

    // Best-effort, runs in parallel with nothing blocking it — never throws.
    const allFaces = await detectFaceTimeline(project.uploadedVideoUrl);
    const { w: srcW, h: srcH } = await getMediaDimensions(videoPath);

    const transcriptText = wordTimings.map((w) => `[${(w.start / 1000).toFixed(2)}] ${w.word}`).join(" ");
    const segments = await getClipsFromGemini(transcriptText, durationSec, clipCount, minDuration, maxDuration, instructions);
    if (segments.length === 0) throw new Error("Gemini returned no valid clip segments");

    const warnings: string[] = [];
    if (sttFailed || wordTimings.length === 0) warnings.push("transcription_failed");
    if (allFaces.length === 0) warnings.push("reframe_unavailable");

    // Best-effort B-roll lookup (P2.3) — resolved up front (outside the
    // transaction) since it's a network call; never blocks or fails the pick.
    const brollPicks = await Promise.all(segments.map(async (seg) => {
      if (!seg.brollQuery) return null;
      const window = computeBrollWindow(seg.end - seg.start);
      if (!window) return null;
      const broll = await pickBroll(seg.brollQuery);
      return broll ? { ...window, url: broll.downloadUrl, query: seg.brollQuery } : null;
    }));

    // Clip creation and the final status flip must succeed or fail together —
    // splitting them (as an earlier version did) let a late, unrelated
    // failure (e.g. a transient error right after Gemini) leave real
    // pending_review Clip rows attached to a Project stuck on "failed",
    // silently discarding a pick that had actually completed.
    await prisma.$transaction([
      ...segments.map((seg, i) => {
        const words = sliceWordsForClip(wordTimings, seg.start, seg.end);
        const hasCaptions = captionStyleIndex >= 0 && words.length > 0;
        const broll = brollPicks[i];
        // A B-roll splice always uses a static crop for its main-footage
        // segments (see renderOneClip) — combining it with a dynamic pan
        // path is more risk than the marginal polish is worth, so skip
        // computing/storing pan keyframes for clips that got B-roll.
        const cropKeyframes = broll ? null : computeStoredCrop(allFaces, seg, aspectRatio, srcW, srcH);
        const sub: SubScores = { hook: seg.hook, pacing: seg.pacing, payoff: seg.payoff, engagement: seg.engagement };
        const initialComposite = Math.round((seg.hook + seg.pacing + seg.payoff + seg.engagement) / 4);

        return prisma.clip.create({
          data: {
            projectId,
            index: i,
            title: seg.title,
            startSec: seg.start,
            endSec: seg.end,
            durationSec: seg.end - seg.start,
            aspectRatio,
            score: initialComposite,
            scoreBreakdown: { ...sub, audio: 0, speechRate: 0, composite: initialComposite } as unknown as Prisma.InputJsonValue,
            mood: seg.mood,
            status: "pending_review",
            transcriptJson: words as unknown as Prisma.InputJsonValue,
            captionStyleIndex: hasCaptions ? captionStyleIndex : null,
            hasCaptions,
            ...(cropKeyframes ? { cropKeyframes: cropKeyframes as unknown as Prisma.InputJsonValue } : {}),
            ...(broll ? {
              brollQuery: broll.query, brollUrl: broll.url,
              brollStartSec: broll.startSec, brollEndSec: broll.endSec,
            } : {}),
          },
        });
      }),
      prisma.project.update({
        where: { id: projectId },
        data: {
          status: "pending_review",
          autoClipCaptionStyle: captionStyleIndex,
          warnings: (warnings.length ? warnings : Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      }),
    ]);
  } catch (err) {
    logger.error("auto-clip", `pick failed for ${projectId}`, err);
    // Clean up any clips from a prior attempt on this project so a retry
    // doesn't accumulate duplicates alongside the ones about to be re-picked.
    await prisma.clip.deleteMany({ where: { projectId, status: "pending_review" } }).catch(() => {});
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    for (const f of [videoPath, audioPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

// B-roll splice (P2.3): [0:v] is the already `-ss/-to`-seeked main clip, so
// its timeline is clip-relative and 0-based (same rebasing the pan-crop
// expressions already rely on) — segments A/C are cut straight from it,
// segment B comes from the (looped, cover-scaled) B-roll input instead. The
// three are concatenated back into one continuous stream, so the clip's
// overall duration and audio track are completely unaffected — captions
// (burned in after the concat) need no re-slicing.
export function buildBrollFilterComplex(
  clipDurationSec: number,
  brollStartSec: number,
  brollEndSec: number,
  aspect: Aspect,
  moodFilter: string | null,
  captionsFilter: string | null,
): string {
  const brollDur = brollEndSec - brollStartSec;
  const staticCrop = aspectRatioFilter(aspect);
  const target = TARGET_RES[aspect];
  // concat requires every segment to share exact frame dimensions AND sample
  // aspect ratio. The static crop alone produces whatever size (and
  // whatever SAR the source happens to carry) the source's own resolution
  // yields (fine for the normal single-segment path, which never needed a
  // canonical size) — here it must also be scaled to B's fixed target
  // resolution with SAR forced to 1:1, since a source with a non-square SAR
  // would otherwise mismatch B's (already-square) scaled output.
  const scaleToTarget = `scale=${target.w}:${target.h},setsar=1`;

  const segA = `[0:v]trim=start=0:end=${brollStartSec},setpts=PTS-STARTPTS,${staticCrop},${scaleToTarget}[va]`;
  const segB = `[1:v]scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,crop=${target.w}:${target.h},setsar=1,trim=0:${brollDur},setpts=PTS-STARTPTS[vb]`;
  const segC = `[0:v]trim=start=${brollEndSec}:end=${clipDurationSec},setpts=PTS-STARTPTS,${staticCrop},${scaleToTarget}[vc]`;
  const postConcat = [moodFilter, captionsFilter].filter((f): f is string => !!f);
  const concatChain = postConcat.length > 0
    ? `[va][vb][vc]concat=n=3:v=1:a=0[vconcatraw];[vconcatraw]${postConcat.join(",")}[video]`
    : `[va][vb][vc]concat=n=3:v=1:a=0[video]`;
  return `${segA};${segB};${segC};${concatChain}`;
}

// ── Per-clip render (shared by the batch render job and single-clip re-render) ─

async function renderOneClip(projectId: string, clip: Clip, videoPath: string): Promise<{ ok: boolean }> {
  const tmp = os.tmpdir();
  const clipPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.mp4`);
  const thumbPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.jpg`);
  const assPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.ass`);
  const brollPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}-broll.mp4`);

  try {
    await prisma.clip.update({ where: { id: clip.id }, data: { status: "rendering", progress: 5 } });

    const aspect = (clip.aspectRatio as Aspect) || "9:16";
    const stored = clip.cropKeyframes as unknown as StoredCrop | null;
    const moodKey = (clip.mood && (MOODS as readonly string[]).includes(clip.mood)) ? (clip.mood as MoodTag) : "neutral";
    const moodFilter = FILTER_PRESETS[MOOD_TO_FILTER[moodKey]].ffmpeg;

    let assEscaped: string | null = null;
    const words = clip.transcriptJson as unknown as WordTiming[] | null;
    if (clip.hasCaptions && words && words.length > 0) {
      const style = styleIndexToSubtitleStyle(clip.captionStyleIndex ?? 0, "oneword");
      generateASS(words, style, assPath);
      assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    }
    const captionsFilter = assEscaped ? `subtitles='${assEscaped}'` : null;

    const baseArgs = ["-y", "-ss", String(clip.startSec), "-to", String(clip.endSec), "-i", videoPath];
    const encodeArgs = ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-c:a", "aac"];

    // B-roll download is best-effort — a transient failure here falls
    // through to the normal crop path below rather than failing the clip.
    let brollReady = false;
    if (clip.brollUrl && clip.brollStartSec != null && clip.brollEndSec != null) {
      try {
        await downloadFile(clip.brollUrl, brollPath);
        brollReady = true;
      } catch (err) {
        logger.warn("auto-clip", `B-roll download failed for clip ${clip.index}, rendering without it`, err);
      }
    }

    let ffmpegArgs: string[];
    if (brollReady && clip.brollStartSec != null && clip.brollEndSec != null) {
      const complex = buildBrollFilterComplex(clip.durationSec, clip.brollStartSec, clip.brollEndSec, aspect, moodFilter, captionsFilter);
      ffmpegArgs = [
        ...baseArgs, "-stream_loop", "-1", "-i", brollPath,
        "-filter_complex", complex, "-map", "[video]", "-map", "0:a",
        ...encodeArgs, "-shortest", clipPath,
      ];
    } else if (stored?.mode === "split" && stored.a.length > 1 && stored.b.length > 1) {
      // Two-speaker split-screen: two independent dynamic crops, vstacked.
      const complex = buildSplitScreenFilterComplex(stored.a, stored.b, moodFilter, captionsFilter);
      ffmpegArgs = [...baseArgs, "-filter_complex", complex, "-map", "[video]", "-map", "0:a", ...encodeArgs, "-shortest", clipPath];
    } else {
      const keyframes = stored?.mode === "single" ? stored.keyframes : null;
      const cropExpr = keyframes && keyframes.length > 1
        ? buildDynamicCropFilter(keyframes, aspect)
        : aspectRatioFilter(aspect);
      const filters = [cropExpr, moodFilter, captionsFilter].filter((f): f is string => !!f);
      ffmpegArgs = [...baseArgs, "-vf", filters.join(","), ...encodeArgs, clipPath];
    }

    await runFFmpegWithProgress(
      ffmpegArgs,
      (pct) => {
        void prisma.clip.update({ where: { id: clip.id }, data: { progress: Math.round(5 + pct * 0.75) } }).catch(() => {});
      },
    );

    await prisma.clip.update({ where: { id: clip.id }, data: { progress: 82 } });
    await runFFmpegArgs([
      "-y", "-ss", String(clip.durationSec / 2), "-i", clipPath,
      "-frames:v", "1", "-vf", "scale=480:-2", thumbPath,
    ]).catch(() => {});

    // Calibrated scoring (P2.4) — refine Gemini's sub-scores with signals
    // measured off the actual rendered clip's audio.
    const analysis = await analyzeAudio(clipPath);
    const sub = (clip.scoreBreakdown as unknown as SubScores) ?? { hook: 50, pacing: 50, payoff: 50, engagement: 50 };
    const breakdown = calibrateScore(sub, analysis, clip.durationSec, words?.length ?? 0);

    await prisma.clip.update({ where: { id: clip.id }, data: { progress: 90 } });
    const videoUrl = await uploadFileToS3(clipPath, `renders/${projectId}/clip-${clip.index}.mp4`, "video/mp4");
    const thumbnailUrl = fs.existsSync(thumbPath)
      ? await uploadFileToS3(thumbPath, `renders/${projectId}/clip-${clip.index}.jpg`, "image/jpeg").catch(() => null)
      : null;

    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        status: "ready", progress: 100, videoUrl, thumbnailUrl,
        score: breakdown.composite,
        scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true };
  } catch (err) {
    logger.error("auto-clip", `clip ${clip.index} failed for ${projectId}`, err);
    await prisma.clip.update({ where: { id: clip.id }, data: { status: "failed" } }).catch(() => {});
    return { ok: false };
  } finally {
    for (const f of [clipPath, thumbPath, assPath, brollPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

// ── Phase 2: render (after the user confirms picks in the review step) ────

export interface RenderPayload { projectId: string }

export async function renderJob(payload: RenderPayload): Promise<void> {
  const { projectId } = payload;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) throw new Error(`Project ${projectId} missing uploadedVideoUrl`);

  const clips = await prisma.clip.findMany({ where: { projectId, status: "queued" }, orderBy: { index: "asc" } });
  if (clips.length === 0) {
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    return;
  }

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src-render.mp4`);

  try {
    await downloadFile(project.uploadedVideoUrl, videoPath);

    let readyCount = 0;
    let bestUrl: string | null = null;
    let bestScore = -1;
    for (const clip of clips) {
      const { ok } = await renderOneClip(projectId, clip, videoPath);
      if (ok) {
        readyCount++;
        const updated = await prisma.clip.findUnique({ where: { id: clip.id }, select: { videoUrl: true, score: true } });
        if (updated?.videoUrl && (updated.score ?? 0) > bestScore) {
          bestScore = updated.score ?? 0;
          bestUrl = updated.videoUrl;
        }
      }
    }

    // Partial-failure refund (P0.5) — proportional to what actually failed,
    // instead of only refunding when every single clip failed.
    const failedCount = clips.length - readyCount;
    if (failedCount > 0) {
      const totalDurationSec = clips.reduce((s, c) => s + c.durationSec, 0);
      const pricing = await getAutoClipPricing();
      const charged = computeCreditCost(clips.length, totalDurationSec, pricing);
      const refundAmount = Math.round(charged * (failedCount / clips.length));
      await refundCredits(projectId, refundAmount);
    }

    if (readyCount === 0) {
      await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    } else {
      await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: bestUrl } });
    }
  } catch (err) {
    logger.error("auto-clip", `render failed for ${projectId}`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } }).catch(() => {});
  } finally {
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
  }
}

// ── Phase 3: single-clip re-render (P1.3) — reuses persisted transcript/crop ─
// data so it never re-runs STT/Gemini/Rekognition, only re-downloads the
// source video and re-cuts this one clip.

export interface RerenderPayload { projectId: string; clipId: string }

export async function rerenderJob(payload: RerenderPayload): Promise<void> {
  const { projectId, clipId } = payload;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!project?.uploadedVideoUrl || !clip) throw new Error(`Missing project/clip for rerender ${clipId}`);

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src-rerender-${clipId}.mp4`);
  try {
    await downloadFile(project.uploadedVideoUrl, videoPath);
    await renderOneClip(projectId, clip, videoPath);
  } finally {
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
  }
}
