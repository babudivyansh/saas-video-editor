// AutoClip pipeline (pick -> review -> render -> re-render). Job functions
// live here (not in the route files) so both the initial route and the
// confirm/rerender endpoints can share them, following the same pattern as
// lib/editor/render-job.ts + app/api/editor/render/route.ts. Each route file
// owns its own `createRenderQueue(...)` call.

import { Prisma, type Clip } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { restoreSpend, grantCredits, spendCredits } from "@/lib/credits";
import { resolveFontFile } from "@/lib/editor/filtergraph";
import { downloadFile } from "@/utils/download";
import {
  extractAudio,
  runFFmpegArgs,
  runFFmpegWithProgress,
  probeMediaDuration,
  getMediaDimensions,
  analyzeAudio,
  generateASS,
  styleIndexToSubtitleStyle,
  encodeArgs,
  maybeUseFilterScript,
  type SubtitleStyle,
  type RenderTarget,
} from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { type WordTiming } from "@/utils/elevenlabs";
import { transcribe } from "@/lib/transcription";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "@/lib/with-retry";
import { NonRetryableError } from "@/lib/render-queue";
import { logger } from "@/lib/logger";
import { timeStage } from "@/lib/pipeline-metrics";
import { env } from "@/lib/env";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/editor/types";
import {
  computeCropKeyframesForClip,
  computeMultiSpeakerKeyframes,
  buildDynamicCropFilter,
  buildSplitScreenFilterComplex,
  buildZoomEnvelope,
  cropSizeFrac,
  type FaceBox,
  type FaceTimelineResult,
  type StoredCrop,
  type ReframeOptions,
} from "@/lib/reframe";
import {
  classifyScene, buildCutKeyframes, buildGroupKeyframes, buildDriftKeyframes,
} from "@/lib/scene-layout";
import { buildSignalTrack, sampleAt, computeAudioPeaks, EMPTY_SIGNAL_TRACK, type SignalTrack } from "@/lib/signal-track";
import {
  parseLiteEdits, planLitePass, speechRangesFromWords, type LiteEdits,
} from "@/lib/autoclip-lite";
import { computeDuckEnvelope, duckVolumeExpr } from "@/lib/audio-ducking";
import { getCaptionTemplate, planEmoji } from "@/lib/caption-templates";
import { buildCameraZoom, applyZoomToKeyframes, ZOOM_STRENGTH_MAX } from "@/lib/camera-motion";
import { getFaceTimeline } from "@/lib/asd";
import { loadFaceTimeline, saveFaceTimeline } from "@/lib/face-timeline-store";
import { calibrateScore, getViralityWeights, type SubScores } from "@/lib/virality-score";
import { computeBrollWindow, pickBroll, planBrollWindows, type BrollCue } from "@/lib/broll";
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

// 2026-07 audit repricing. Charge model:
//   analyze:  analysisPerHalfHour × ceil(sourceMin/30), charged when the
//             pick job starts (deters "scan everything, render nothing"),
//             then CREDITED against the confirm charge — net zero for users
//             who confirm.
//   confirm:  perClip × keptClips + perTwoMinutes × ceil(keptMin/2)
//             − analysis already paid (floored at 0).
//   rerender: first re-render of each clip free, then `rerender` each.
export interface AutoClipPricing {
  perClip: number;
  perTwoMinutes: number;
  analysisPerHalfHour: number;
  rerender: number;
}

export const AUTOCLIP_PRICING_DEFAULTS: AutoClipPricing = {
  perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1,
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
  const twoMinuteBlocks = Math.ceil(totalDurationSec / 120);
  return clipCount * pricing.perClip + twoMinuteBlocks * pricing.perTwoMinutes;
}

export function computeAnalysisCost(sourceDurationSec: number, pricing: AutoClipPricing): number {
  return Math.ceil(sourceDurationSec / 1800) * pricing.analysisPerHalfHour;
}

export const analysisRefId = (projectId: string) => `auto-clip-analysis:${projectId}`;

// What to persist on Project.failureReason for the UI to render.
//
// NonRetryableError messages are written for a creator ("Video is too short…",
// "…upgrade for longer uploads") and are safe and useful to show verbatim.
// Anything else is an internal fault — a Gemini timeout, an S3 error, an
// ffmpeg stderr dump — which would be noise at best and leak infrastructure
// detail at worst, so it collapses to a generic line.
export function userFacingFailure(err: unknown): string {
  if (err instanceof NonRetryableError) return err.message;
  return "We couldn't generate clips from this video. Please try again — you haven't been charged.";
}

/** Credits already paid (net of refunds) for this project's analysis step. */
export async function getAnalysisCreditsPaid(userId: string, projectId: string): Promise<number> {
  const rows = await prisma.creditTransaction.findMany({
    where: { userId, refId: analysisRefId(projectId) },
    select: { delta: true },
  });
  return Math.max(rows.reduce((s, r) => s - r.delta, 0), 0);
}

export async function refundCredits(projectId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!proj) return;
    // Partial refund against the confirm-route spend (`auto-clip:{projectId}`)
    // — restores exactly the buckets it drained, capped at what was spent.
    const restored = await restoreSpend({
      userId: proj.userId,
      refId: `auto-clip:${projectId}`,
      amount,
      reason: "refund:auto-clip-partial",
    });
    if (restored < amount) {
      // Legacy project charged before the bucket split (no ledger rows).
      //
      // This used to fire on ANY shortfall, which quietly turned "we tried to
      // refund more than was ever spent" into freshly granted credits: a run
      // can refund twice (partial-failure, then the trimmed-duration delta),
      // and the amounts are computed from gross pricing while the confirm
      // charge is net of the analysis credit — so the sum can exceed the
      // spend. Restricting it to refIds with no ledger history at all keeps
      // the legacy path working and makes over-refund impossible.
      const spendRows = await prisma.creditTransaction.count({
        where: { userId: proj.userId, refId: `auto-clip:${projectId}` },
      });
      if (spendRows === 0) {
        await grantCredits({
          userId: proj.userId,
          bucket: "purchased",
          amount: amount - restored,
          reason: "refund:auto-clip-legacy",
          refId: `auto-clip:${projectId}`,
        });
      }
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
  brollOffsetSec: number | null;
  reasoning: string;
  hookExplanation: string;
  retentionPrediction: string;
  audience: string;
  platform: string;
  suggestedPostingTime: string;
  hashtags: string[];
  suggestedCaption: string;
  /**
   * Words the speaker leans on, as indexes into the clip's own word list.
   * Loudness alone can't find these — a calmly delivered key term carries the
   * point without carrying volume — so the model tags them and they feed both
   * the camera's energy envelope and caption emphasis.
   */
  emphasisWordIndexes: number[];
  /** Raw words as returned by the model, before index resolution. */
  emphasisWords: string[];
  /** Keyword-anchored B-roll suggestions, resolved to windows in pickJob. */
  brollCues: BrollCue[];
}

/**
 * Map the model's emphasis WORDS onto positions in a clip's word list.
 * Matching by normalised text rather than trusting model-supplied indexes,
 * which are unreliable — and taking the first unused occurrence so a repeated
 * word doesn't collapse onto one position.
 */
export function resolveEmphasisIndexes(words: WordTiming[], emphasisWords: string[]): number[] {
  if (emphasisWords.length === 0 || words.length === 0) return [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
  const used = new Set<number>();
  const out: number[] = [];
  for (const target of emphasisWords.map(norm).filter(Boolean)) {
    const idx = words.findIndex((w, i) => !used.has(i) && norm(w.word) === target);
    if (idx >= 0) { used.add(idx); out.push(idx); }
  }
  return out.sort((a, b) => a - b);
}

// ── Transcript formatting for the LLM ───────────────────────────────────────
// The prompt used to carry one `[12.34] word` timestamp PER WORD. On a 6-hour
// source — which the Studio tier sells — that's ~60k words and well over 200k
// tokens of mostly punctuation, in a single call with a 30s timeout. It
// truncates or fails.
//
// Grouping into short phrases with one timestamp each cuts that by an order of
// magnitude while keeping every timestamp the model actually needs: it picks
// clip boundaries in seconds, and a boundary is only ever placed at a phrase
// edge anyway.

const PHRASE_GAP_MS = 700;   // a pause this long ends a phrase
const PHRASE_MAX_WORDS = 12;

export function formatTranscriptForPrompt(words: WordTiming[]): string {
  if (words.length === 0) return "";
  const lines: string[] = [];
  let start = words[0].start;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    lines.push(`[${(start / 1000).toFixed(1)}] ${buf.join(" ")}`);
    buf = [];
  };

  for (let i = 0; i < words.length; i++) {
    if (buf.length === 0) start = words[i].start;
    buf.push(words[i].word);
    const gapToNext = i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity;
    if (buf.length >= PHRASE_MAX_WORDS || gapToNext > PHRASE_GAP_MS) flush();
  }
  flush();
  return lines.join("\n");
}

// Above this source length, one prompt can't hold the transcript at usable
// fidelity, so it's scored in windows and the winners ranked globally.
const MAP_REDUCE_THRESHOLD_SEC = 45 * 60;
const MAP_WINDOW_SEC = 20 * 60;

/** Split words into overlapping-free windows for the map phase. */
export function splitIntoWindows(
  words: WordTiming[],
  durationSec: number,
  windowSec: number,
): { startSec: number; endSec: number; words: WordTiming[] }[] {
  const windows: { startSec: number; endSec: number; words: WordTiming[] }[] = [];
  for (let start = 0; start < durationSec; start += windowSec) {
    const end = Math.min(durationSec, start + windowSec);
    const inWindow = words.filter((w) => w.start >= start * 1000 && w.start < end * 1000);
    // A window with no speech has nothing to select from.
    if (inWindow.length > 0 || words.length === 0) windows.push({ startSec: start, endSec: end, words: inWindow });
  }
  return windows;
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
[{"start":12.5,"end":35.0,"title":"The mistake everyone makes","hook":87,"pacing":75,"payoff":80,"engagement":82,"mood":"energetic","brollQuery":"city traffic at night","brollOffsetSec":8.0,"reasoning":"A very high energy hook that immediately challenges the viewer. Pacing remains fast throughout.","hookExplanation":"The hook poses a counter-intuitive question in the first 2 seconds, forcing curiosity.","retentionPrediction":"High: Pacing has no gaps, and the story resolves in under 25 seconds.","audience":"Content creators, marketing professionals","platform":"YouTube Shorts, Instagram Reels","suggestedPostingTime":"5:00 PM - 8:00 PM local time","hashtags":["#videomarketing","#contentcreation","#growth"],"suggestedCaption":"Avoid this one mistake at all costs!"}]

For each clip include:
- "title": a short, punchy, scroll-stopping hook (max 60 characters), no quotes inside
- "hook": 0-99, how strong/attention-grabbing the first 2 seconds are
- "pacing": 0-99, how tight and well-paced the clip is (no dead air, no rambling)
- "payoff": 0-99, whether the clip has a clear punchline, insight, or resolution
- "engagement": 0-99, overall predicted engagement if posted to Reels/Shorts
- "mood": one of "energetic", "calm", "dramatic", "funny", "neutral" — the dominant emotional tone
- "brollQuery": a short 2-4 word visual search term for stock B-roll footage (or null if none needed)
- "brollOffsetSec": seconds from THIS clip's own start (not the source video) where the B-roll should play — pick a moment where the speaker is describing something visual rather than delivering the hook or punchline (or null if brollQuery is null)
- "reasoning": 1-2 sentences explaining why this clip has viral potential (curiosity, value, story)
- "hookExplanation": brief explanation of the initial hook's strength
- "retentionPrediction": short sentence predicting viewer retention potential
- "audience": target audience demographic
- "platform": best social platforms for this video (e.g. YouTube Shorts, Instagram Reels)
- "suggestedPostingTime": time window suggestion for maximum exposure
- "hashtags": array of 3-4 trending hashtags
- "suggestedCaption": engaging, ready-to-use social caption
- "emphasisWords": array of up to 6 short strings — the exact words IN THIS CLIP the speaker leans on or that carry the point. Copy them verbatim from the transcript, lowercase, no punctuation.
- "brollCues": array of up to 3 objects [{"word":"city","query":"city skyline at night"}] — a concrete NOUN the speaker says that a stock shot could illustrate, paired with a 2-4 word search term. Copy "word" verbatim from the transcript. Return [] if the clip is better served by staying on the speaker.

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

Transcript (each line is "[start seconds] phrase"):
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
    brollOffsetSec?: number | null;
    reasoning?: string;
    hookExplanation?: string;
    retentionPrediction?: string;
    audience?: string;
    platform?: string;
    suggestedPostingTime?: string;
    hashtags?: string[];
    suggestedCaption?: string;
    emphasisWords?: string[];
    brollCues?: { word?: string; query?: string }[];
  }>;
  const clampSub = (n: unknown) => Math.max(0, Math.min(99, Math.round(typeof n === "number" ? n : 50)));

  const mapped = raw
    .filter((c) => typeof c.start === "number" && typeof c.end === "number" && c.end > c.start)
    .map((c, i) => {
      const start = Math.max(0, Math.min(c.start, durationSec - 1));
      const end = Math.min(c.end, durationSec);
      const brollQuery = (typeof c.brollQuery === "string" && c.brollQuery.trim()) ? c.brollQuery.trim().slice(0, 60) : null;
      const brollOffsetSec = (brollQuery && typeof c.brollOffsetSec === "number" && Number.isFinite(c.brollOffsetSec))
        ? Math.max(0, Math.min(c.brollOffsetSec, end - start))
        : null;
      return {
      start, end,
      title: (typeof c.title === "string" && c.title.trim()) ? c.title.trim().slice(0, 80) : `Clip ${i + 1}`,
      hook: clampSub(c.hook), pacing: clampSub(c.pacing), payoff: clampSub(c.payoff), engagement: clampSub(c.engagement),
      mood: (MOODS as readonly string[]).includes(c.mood ?? "") ? (c.mood as MoodTag) : "neutral",
      brollQuery, brollOffsetSec,
      reasoning: (typeof c.reasoning === "string" && c.reasoning.trim()) ? c.reasoning.trim() : "Highly engaging highlight from the source video.",
      hookExplanation: (typeof c.hookExplanation === "string" && c.hookExplanation.trim()) ? c.hookExplanation.trim() : "Strong dynamic start.",
      retentionPrediction: (typeof c.retentionPrediction === "string" && c.retentionPrediction.trim()) ? c.retentionPrediction.trim() : "High potential retention.",
      audience: (typeof c.audience === "string" && c.audience.trim()) ? c.audience.trim() : "General social media audience.",
      platform: (typeof c.platform === "string" && c.platform.trim()) ? c.platform.trim() : "YouTube Shorts, Instagram Reels",
      suggestedPostingTime: (typeof c.suggestedPostingTime === "string" && c.suggestedPostingTime.trim()) ? c.suggestedPostingTime.trim() : "5:00 PM local time",
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.map(String) : ["#highlight", "#viral"],
      suggestedCaption: (typeof c.suggestedCaption === "string" && c.suggestedCaption.trim()) ? c.suggestedCaption.trim() : "Check out this amazing moment!",
      // Resolved to word indexes later, once the clip's word slice is known —
      // the model returns words, not positions, because asking an LLM for
      // array indexes into a transcript it only saw as text is unreliable.
      emphasisWords: Array.isArray(c.emphasisWords) ? c.emphasisWords.map(String).slice(0, 6) : [],
      emphasisWordIndexes: [],
      brollCues: Array.isArray(c.brollCues)
        ? c.brollCues
            .filter((q) => typeof q?.word === "string" && typeof q?.query === "string")
            .map((q) => ({ word: String(q.word).slice(0, 40), query: String(q.query).slice(0, 60) }))
            .slice(0, 3)
        : [],
      };
    });

  return enforceNonOverlapping(mapped, minDuration).slice(0, clipCount);
}

/**
 * Clip selection that scales to long sources.
 *
 * Short videos take the single-call path unchanged. Past
 * MAP_REDUCE_THRESHOLD_SEC the transcript can't fit one prompt at usable
 * fidelity, so each window is scored independently (asking for a generous
 * share of clips so good windows aren't starved), then the pooled candidates
 * are ranked globally by their own sub-scores and the best kept. Ranking on
 * scores the model already returns avoids a second LLM round-trip.
 */
async function selectClips(
  words: WordTiming[],
  durationSec: number,
  clipCount: number,
  minDuration: number,
  maxDuration: number,
  instructions: string,
): Promise<GeminiSegment[]> {
  if (durationSec <= MAP_REDUCE_THRESHOLD_SEC || words.length === 0) {
    return getClipsFromGemini(formatTranscriptForPrompt(words), durationSec, clipCount, minDuration, maxDuration, instructions);
  }

  const windows = splitIntoWindows(words, durationSec, MAP_WINDOW_SEC);
  logger.info("auto-clip", `long source (${(durationSec / 60).toFixed(0)} min) — scoring ${windows.length} windows`);

  // Ask each window for a few candidates; the reduce step picks the winners.
  const perWindow = Math.max(2, Math.ceil((clipCount * 2) / windows.length));

  const results = await Promise.all(windows.map(async (win) => {
    try {
      // Each window is prompted in its OWN 0-based time frame, then shifted
      // back — otherwise the model has to reason about absolute offsets it
      // can't see, and reliably returns out-of-range values.
      const local = win.words.map((w) => ({
        word: w.word,
        start: w.start - win.startSec * 1000,
        end: w.end - win.startSec * 1000,
      }));
      const segs = await getClipsFromGemini(
        formatTranscriptForPrompt(local),
        win.endSec - win.startSec,
        perWindow, minDuration, maxDuration, instructions,
      );
      return segs.map((s) => ({ ...s, start: s.start + win.startSec, end: s.end + win.startSec }));
    } catch (err) {
      // One bad window must not lose the whole video.
      logger.warn("auto-clip", `window ${win.startSec}-${win.endSec}s failed, skipping`, err);
      return [];
    }
  }));

  const pooled = results.flat();
  if (pooled.length === 0) return [];

  const rank = (s: GeminiSegment) => s.hook * 0.4 + s.payoff * 0.25 + s.engagement * 0.25 + s.pacing * 0.1;
  const best = [...pooled].sort((a, b) => rank(b) - rank(a)).slice(0, clipCount * 2);
  // enforceNonOverlapping expects ascending order and resolves collisions
  // between windows that both claimed a boundary region.
  return enforceNonOverlapping(best.sort((a, b) => a.start - b.start), minDuration).slice(0, clipCount);
}

// The "clips must not overlap / sort by start ascending" rules above are only
// ever *requested* of Gemini in the prompt text — nothing stops a slightly-off
// response from returning overlapping segments. This is the deterministic
// backstop: sort by start, then push each segment's start forward past the
// previous kept segment's end, dropping it if that leaves it shorter than the
// requested minDuration rather than keeping a sliver.
export function enforceNonOverlapping<T extends { start: number; end: number }>(segments: T[], minDurationSec: number): T[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const result: T[] = [];
  let prevEnd = -Infinity;
  for (const seg of sorted) {
    const start = Math.max(seg.start, prevEnd);
    const end = seg.end;
    if (end - start < minDurationSec) continue;
    result.push(start === seg.start ? seg : { ...seg, start });
    prevEnd = end;
  }
  return result;
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
  options: ReframeOptions = {}
): StoredCrop | null {
  if (srcW <= 0 || srcH <= 0) return null;

  // Scene type decides the layout, once per clip. Previously every clip got
  // either a single-face pan or a two-person stack, so a four-person panel or
  // a faceless stretch was framed by accident.
  const scene = classifyScene(allFaces, seg.start, seg.end);
  const duration = seg.end - seg.start;
  const inWindow = allFaces
    .filter((f) => f.tSec >= seg.start && f.tSec <= seg.end && f.confidence >= 60)
    .map((f) => ({ ...f, tSec: f.tSec - seg.start }));
  const { w: sceneCropW, h: sceneCropH } = cropSizeFrac(aspectRatio, srcW, srcH);
  const speakerMode0 = options.speakerMode ?? "auto";

  if (speakerMode0 === "auto") {
    if (scene.type === "dialogue" && aspectRatio === "9:16") {
      // Alternating conversation reads better as cuts than as a permanent
      // split: a split screen makes the viewer work out who is speaking.
      const cuts = buildCutKeyframes(inWindow, duration, sceneCropW, sceneCropH);
      if (cuts.length > 1) return { mode: "single", keyframes: cuts };
    }
    if (scene.type === "group") {
      const group = buildGroupKeyframes(inWindow, duration, sceneCropW, sceneCropH);
      if (group.length > 1) return { mode: "single", keyframes: group };
    }
    if (scene.type === "none") {
      // Nothing to track: a slow drift beats a dead-static crop, and beats
      // inventing motion that implies a subject.
      return { mode: "single", keyframes: buildDriftKeyframes(duration, sceneCropW, sceneCropH) };
    }
  }

  // `preset` is not read here — the two keyframe builders below each pull it
  // off the `options` object they're handed.
  const speakerMode = options.speakerMode ?? "auto";

  if (aspectRatio === "9:16" && allFaces.length > 0 && (speakerMode === "split" || speakerMode === "auto")) {
    const multi = computeMultiSpeakerKeyframes(allFaces, seg.start, seg.end, srcW, srcH, options);
    if (multi) return { mode: "split", a: multi.a, b: multi.b };
  }
  if (allFaces.length > 0) {
    const single = computeCropKeyframesForClip(allFaces, seg.start, seg.end, aspectRatio, srcW, srcH, options);
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
  reframingPreset?: string;
  removeSilence?: boolean;
  silenceThresholdMs?: number;
  removeFillers?: boolean;
  smartAutoReframe?: boolean;
  zoomStrength?: "low" | "medium" | "high";
  speakerMode?: "auto" | "single" | "split" | "active";
  smoothness?: number;
  trackingSpeed?: number;
  animatedCaptions?: boolean;
}

export async function pickJob(payload: PickPayload): Promise<void> {
  const {
    projectId, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionStyleIndex,
    reframingPreset = "balanced", removeSilence = false, silenceThresholdMs = 400, removeFillers = false,
    smartAutoReframe = true, zoomStrength = "medium", speakerMode = "auto", smoothness = 50, trackingSpeed = 50,
    animatedCaptions = false
  } = payload;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.uploadedVideoUrl) throw new Error(`Project ${projectId} missing uploadedVideoUrl`);

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src.mp4`);
  const audioPath = path.join(tmp, `${projectId}-audio.mp3`);
  let analysisCharged = 0;

  // Every individual step in this job is time-bounded, but a NEW unbounded
  // step (or an external service that hangs below its own timeout) could still
  // strand the project on "analyzing" forever — which is exactly what
  // happened in production. This watchdog is the backstop: if the whole job
  // outruns its budget, fail the project (so the UI unsticks and the analysis
  // charge is refunded) rather than leaving it spinning indefinitely. The
  // `aborted` flag is checked before the final write so a late-completing body
  // can't resurrect a job the watchdog already failed.
  const WATCHDOG_MS = 30 * 60 * 1000;
  let aborted = false;
  let refundDone = false;
  const refundAnalysis = async (reason: string) => {
    if (refundDone || analysisCharged <= 0) return;
    refundDone = true;
    await restoreSpend({ userId: project.userId, refId: analysisRefId(projectId), amount: analysisCharged, reason })
      .catch(() => {});
  };
  const watchdog = setTimeout(() => {
    aborted = true;
    void (async () => {
      logger.error("auto-clip", `pick watchdog fired for ${projectId} after ${WATCHDOG_MS}ms — failing the job`);
      await refundAnalysis("refund:auto-clip-analysis-timeout");
      await prisma.clip.deleteMany({ where: { projectId, status: "pending_review" } }).catch(() => {});
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "failed",
          failureReason: "Analysis took too long and was stopped. Try a shorter video, or one in a standard format (MP4/MOV).",
        },
      }).catch(() => {});
    })();
  }, WATCHDOG_MS);
  watchdog.unref?.();

  try {
    await timeStage("download", () => downloadFile(project.uploadedVideoUrl!, videoPath));
    const probe = await probeMediaDuration(videoPath);
    if (probe.durationSec === null) {
      // A failed probe is NOT a short video. Reporting it as one blamed the
      // user's file for what was actually our side — a truncated download, an
      // unreadable container, or a missing ffmpeg binary — and, because that
      // was thrown as non-retryable, failed the job permanently with a message
      // nobody could act on. This is retryable and says what actually happened.
      logger.error("auto-clip", `duration probe failed for ${projectId}: ${probe.reason}`, {
        fileBytes: probe.fileBytes,
        sourceUrl: project.uploadedVideoUrl,
        stderrTail: probe.stderrTail,
      });
      throw new Error(`Could not read the uploaded video (${probe.reason}, ${probe.fileBytes} bytes)`);
    }

    const durationSec = probe.durationSec;
    if (durationSec < minDuration) {
      // Genuinely too short: the video will still be so on attempt 2 and 3,
      // and each retry re-downloads the whole source to find that out.
      throw new NonRetryableError(`Video is too short (${durationSec.toFixed(1)}s) for the requested clip duration (min ${minDuration}s)`);
    }
    // Tiered source-length cap (cost ceiling per job + upgrade trigger).
    {
      const { getUserTier } = await import("@/lib/auth");
      const { TIER_MAX_AUTOCLIP_SOURCE_SECONDS } = await import("@/lib/plans/tiers");
      const tier = await getUserTier(project.userId);
      const cap = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier];
      if (durationSec > cap) {
        throw new NonRetryableError(
          `Video is ${(durationSec / 60).toFixed(0)} min — your plan supports Auto Clips up to ${Math.round(cap / 60)} min per video. Upgrade for longer uploads.`,
        );
      }
    }

    // Analysis charge (credited back against the confirm charge — see the
    // pricing comment above AutoClipPricing). Refunded if this job fails.
    {
      const pricing = await getAutoClipPricing();
      const analysisCost = computeAnalysisCost(durationSec, pricing);
      if (analysisCost > 0) {
        const spend = await spendCredits({
          userId: project.userId,
          amount: analysisCost,
          reason: "spend:auto-clip-analysis",
          refId: analysisRefId(projectId),
        });
        if (!spend.ok) {
          throw new NonRetryableError(
            `Analyzing this video costs ${analysisCost} credit${analysisCost === 1 ? "" : "s"} (credited back when you confirm clips) — you don't have enough credits.`,
          );
        }
        analysisCharged = analysisCost;
      }
    }

    // Rekognition face detection is the single longest-running call in this
    // job (up to 5 minutes, see MAX_POLL_MS in lib/reframe.ts) and depends on
    // neither the transcript nor Gemini's output — kick it off now and run it
    // concurrently with STT + Gemini below instead of waiting on it after
    // they've already finished.
    // Prefers the GPU active-speaker model and falls back to Rekognition, then
    // to nothing (static centre crop) — see lib/asd.ts. Timelines are cached
    // via loadFaceTimeline/saveFaceTimeline, which keeps the samples in an S3
    // sidecar rather than a Postgres JSON column: a multi-hour source produces
    // six figures of samples, which is not a column value.
    const cached = await loadFaceTimeline(project);
    const faceTimelinePromise: Promise<FaceTimelineResult> = cached
      ? Promise.resolve({ boxes: cached })
      : getFaceTimeline(project.userId, project.uploadedVideoUrl);

    let wordTimings: WordTiming[] = [];
    let sttFailed = false;
    try {
      await extractAudio(videoPath, audioPath);
      // retries internally + falls back to Whisper, see lib/transcription.ts
      wordTimings = await timeStage(
        "transcribe",
        () => transcribe(fs.readFileSync(audioPath)),
        { meta: { sourceMin: Math.round(durationSec / 60) } },
      );
    } catch (err) {
      sttFailed = true;
      logger.warn("auto-clip", "transcription failed, Gemini will work without transcript", err);
    }

    const segments = await timeStage(
      "select",
      () => selectClips(wordTimings, durationSec, clipCount, minDuration, maxDuration, instructions),
      { meta: { sourceMin: Math.round(durationSec / 60), clipCount } },
    );
    if (segments.length === 0) throw new Error("Gemini returned no valid clip segments");

    // Faces are only needed from here on (computeStoredCrop below) — by now
    // the Rekognition call has had the entire STT+Gemini duration to finish
    // in the background instead of blocking in front of it.
    const faceResult = await faceTimelinePromise;
    const allFaces = faceResult.boxes;
    if (!cached && allFaces.length > 0) {
      await saveFaceTimeline(projectId, allFaces);
    }
    const { w: srcW, h: srcH } = await getMediaDimensions(videoPath);

    const warnings: string[] = [];
    if (sttFailed || wordTimings.length === 0) warnings.push("transcription_failed");
    if (allFaces.length === 0) {
      // "we couldn't run face detection" is a different message from "this
      // footage has no faces to track" — the first is ours to fix and applies
      // to every video on the deployment, the second is a fact about the file.
      warnings.push(faceResult.failure ? "reframe_failed" : "reframe_unavailable");
    }

    // Best-effort B-roll lookup (P2.3) — resolved up front (outside the
    // transaction) since it's a network call; never blocks or fails the pick.
    // B-roll placement. Keyword cues are preferred: an insert that lands on
    // the noun the speaker says reads as illustration, while one dropped at an
    // arbitrary offset reads as the video losing its place. The old
    // single-offset path remains as the fallback for when the model returns no
    // usable cues.
    const brollPicks = await Promise.all(segments.map(async (seg) => {
      const clipDuration = seg.end - seg.start;
      const words = sliceWordsForClip(wordTimings, seg.start, seg.end);

      const planned = planBrollWindows(seg.brollCues, words, clipDuration);
      if (planned.length > 0) {
        const resolved = await Promise.all(planned.map(async (p) => {
          const found = await pickBroll(p.query);
          return found ? { startSec: p.startSec, endSec: p.endSec, url: found.downloadUrl, query: p.query } : null;
        }));
        const usable = resolved.filter((w): w is NonNullable<typeof w> => w !== null);
        if (usable.length > 0) return usable;
      }

      if (!seg.brollQuery) return null;
      const window = computeBrollWindow(clipDuration, seg.brollOffsetSec);
      if (!window) return null;
      const broll = await pickBroll(seg.brollQuery);
      return broll ? [{ ...window, url: broll.downloadUrl, query: seg.brollQuery }] : null;
    }));

    // Speech signal tracks (P2.1) — loudness/pitch/energy envelopes, shot
    // boundaries and pauses per clip. Computed here, while the source video is
    // already on local disk, so the render never has to decode it again.
    // Best-effort: a clip without one simply renders non-reactively.
    const signalTracks = await Promise.all(segments.map(async (seg) => {
      const words = sliceWordsForClip(wordTimings, seg.start, seg.end);
      if (words.length === 0) return EMPTY_SIGNAL_TRACK;
      seg.emphasisWordIndexes = resolveEmphasisIndexes(words, seg.emphasisWords);
      return buildSignalTrack(videoPath, seg.start, seg.end, words, seg.emphasisWordIndexes);
    }));

    // Clip creation and the final status flip must succeed or fail together —
    // splitting them (as an earlier version did) let a late, unrelated
    // failure (e.g. a transient error right after Gemini) leave real
    // pending_review Clip rows attached to a Project stuck on "failed",
    // silently discarding a pick that had actually completed.
    // The watchdog already failed and cleaned up this job; do not write clips
    // or flip the status back, which would resurrect a job the user has been
    // told failed (and refunded for).
    if (aborted) return;

    await prisma.$transaction([
      ...segments.map((seg, i) => {
        const words = sliceWordsForClip(wordTimings, seg.start, seg.end);
        const hasCaptions = captionStyleIndex >= 0 && words.length > 0;
        const broll = brollPicks[i];
        // B-roll used to disable reframing for the WHOLE clip, so a 2.5s stock
        // insert cost the other ~30 seconds their speaker tracking. The
        // B-roll segments are ordinary crops in the same graph and can carry
        // the same dynamic expressions, so the pan path is computed either way
        // (buildBrollFilterComplex applies it to the main-footage segments).
        const cropKeyframes = computeStoredCrop(allFaces, seg, aspectRatio, srcW, srcH, {
          preset: reframingPreset,
          smartAutoReframe,
          zoomStrength,
          speakerMode,
          smoothness,
          trackingSpeed,
          words,
        });
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
            scoreBreakdown: {
              ...sub,
              audio: 0,
              speechRate: 0,
              composite: initialComposite,
              reasoning: seg.reasoning,
              hookExplanation: seg.hookExplanation,
              retentionPrediction: seg.retentionPrediction,
              audience: seg.audience,
              platform: seg.platform,
              suggestedPostingTime: seg.suggestedPostingTime,
              hashtags: seg.hashtags,
              suggestedCaption: seg.suggestedCaption,
            } as unknown as Prisma.InputJsonValue,
            mood: seg.mood,
            signalTrack: signalTracks[i] as unknown as Prisma.InputJsonValue,
            status: "pending_review",
            transcriptJson: words as unknown as Prisma.InputJsonValue,
            captionStyleIndex: hasCaptions ? captionStyleIndex : null,
            hasCaptions,
            subtitleStyleOverride: { animated: animatedCaptions } as unknown as Prisma.InputJsonValue,
            silenceSettings: {
              removeSilence,
              silenceThresholdMs,
              removeFillers,
              reframingPreset,
              smartAutoReframe,
              zoomStrength,
              speakerMode,
              smoothness,
              trackingSpeed,
            } as unknown as Prisma.InputJsonValue,
            ...(cropKeyframes ? { cropKeyframes: cropKeyframes as unknown as Prisma.InputJsonValue } : {}),
            ...(broll && broll.length > 0 ? {
              brollWindows: broll as unknown as Prisma.InputJsonValue,
              // The single-window columns stay populated with the first insert
              // so anything still reading them (older code paths, the results
              // grid's "B-roll" badge) keeps working.
              brollQuery: broll[0].query, brollUrl: broll[0].url,
              brollStartSec: broll[0].startSec, brollEndSec: broll[0].endSec,
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
          // A retry that succeeds must not keep showing the previous attempt's error.
          failureReason: null,
        },
      })
    ]);
  } catch (err) {
    // If the watchdog already fired, it has done the cleanup — don't repeat it
    // (and don't double-refund; refundAnalysis is single-shot regardless).
    if (aborted) throw err;
    logger.error("auto-clip", `pick failed for ${projectId}`, err);
    // A failed analysis is never billed.
    await refundAnalysis("refund:auto-clip-analysis-failed");
    // Clean up any clips from a prior attempt on this project so a retry
    // doesn't accumulate duplicates alongside the ones about to be re-picked.
    await prisma.clip.deleteMany({ where: { projectId, status: "pending_review" } }).catch(() => {});
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed", failureReason: userFacingFailure(err) },
    }).catch(() => {});
    // Rethrow (after the cleanup above already ran) so createRenderQueue's
    // wrapper sees a real failure and BullMQ's attempts:3/backoff actually
    // retries transient errors (a flaky Gemini/S3 call) instead of stopping
    // dead after one try — previously only rerenderJob got this for free by
    // never catching its own errors.
    throw err;
  } finally {
    clearTimeout(watchdog);
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
export interface BrollWindow { startSec: number; endSec: number }

/**
 * Splice one or more B-roll windows into a clip.
 *
 * The crop is applied to the WHOLE clip before it is split, not to each
 * segment after trimming. `trim` + `setpts=PTS-STARTPTS` rebases `t` to zero
 * for each segment, so a time-varying crop applied afterwards would replay the
 * start of the pan path in every later segment instead of continuing it. Doing
 * the crop first keeps `t` clip-relative, which is the basis every crop
 * keyframe is expressed in.
 *
 * Windows must be sorted and non-overlapping; the caller (lib/broll.ts's
 * planBrollWindows) guarantees both.
 */
export function buildMultiBrollFilterComplex(
  clipDurationSec: number,
  windows: BrollWindow[],
  aspect: Aspect,
  moodFilter: string | null,
  captionsFilter: string | null,
  videoSrc = "[0:v]",
  mainCropFilter?: string | null,
): string {
  const target = TARGET_RES[aspect];
  const scaleToTarget = `scale=${target.w}:${target.h},setsar=1`;
  const cropChain = `${mainCropFilter ?? aspectRatioFilter(aspect)},${scaleToTarget}`;

  // Main-footage segments sit between the windows: one before the first, one
  // after the last, and one in each gap.
  const mainSpans: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const w of windows) {
    mainSpans.push({ start: cursor, end: w.startSec });
    cursor = w.endSec;
  }
  mainSpans.push({ start: cursor, end: clipDurationSec });

  // A zero-length span would produce an empty segment that breaks concat.
  const usableMain = mainSpans.filter((s) => s.end - s.start > 0.04);

  const parts: string[] = [];
  parts.push(`${videoSrc}${cropChain}[mainraw]`);
  parts.push(`[mainraw]split=${usableMain.length}${usableMain.map((_, i) => `[m${i}]`).join("")}`);

  const order: string[] = [];
  let mainIdx = 0;
  const emitMain = (span: { start: number; end: number }) => {
    const label = `[vm${mainIdx}]`;
    parts.push(`[m${mainIdx}]trim=start=${span.start}:end=${span.end},setpts=PTS-STARTPTS${label}`);
    order.push(label);
    mainIdx++;
  };

  let spanCursor = 0;
  for (const [i, w] of windows.entries()) {
    const before = mainSpans[i];
    if (before.end - before.start > 0.04) emitMain(usableMain[spanCursor++] ?? before);
    const label = `[vb${i}]`;
    const dur = w.endSec - w.startSec;
    // Each B-roll clip is its own input, cover-scaled to the target frame.
    parts.push(
      `[${i + 1}:v]scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,` +
      `crop=${target.w}:${target.h},setsar=1,trim=0:${dur},setpts=PTS-STARTPTS${label}`,
    );
    order.push(label);
  }
  const tail = mainSpans[mainSpans.length - 1];
  if (tail.end - tail.start > 0.04) emitMain(usableMain[spanCursor++] ?? tail);

  const postConcat = [moodFilter, captionsFilter].filter((f): f is string => !!f);
  const concat = `${order.join("")}concat=n=${order.length}:v=1:a=0`;
  parts.push(postConcat.length > 0
    ? `${concat}[vconcatraw];[vconcatraw]${postConcat.join(",")}[video]`
    : `${concat}[video]`);

  return parts.join(";");
}

/** Single-window convenience wrapper, kept for the common case. */
export function buildBrollFilterComplex(
  clipDurationSec: number,
  brollStartSec: number,
  brollEndSec: number,
  aspect: Aspect,
  moodFilter: string | null,
  captionsFilter: string | null,
  videoSrc = "[0:v]",
  mainCropFilter?: string | null,
): string {
  return buildMultiBrollFilterComplex(
    clipDurationSec,
    [{ startSec: brollStartSec, endSec: brollEndSec }],
    aspect, moodFilter, captionsFilter, videoSrc, mainCropFilter,
  );
}

interface CutSegment { startMs: number; endMs: number }
interface KeepSegment { startMs: number; endMs: number }

// Single-token fillers, matched against one normalized word at a time.
const FILLERS = new Set([
  "um", "umm", "uh", "uhh", "erm", "hmm",
  "like", "basically", "actually", "yknow", "y'know",
]);
// Two-word fillers ASR emits as separate tokens (e.g. "you"/"know") — a
// single-token Set.has() can never match these, so they get their own pass.
const FILLER_BIGRAMS = new Set(["you know", "i mean", "sort of", "kind of"]);

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
}

export function computeKeeps(
  words: WordTiming[],
  clipDurationSec: number,
  removeSilence: boolean,
  silenceThresholdMs: number,
  removeFillers: boolean
): { keeps: KeepSegment[]; cuts: CutSegment[] } {
  const durationMs = clipDurationSec * 1000;
  const cuts: CutSegment[] = [];

  if (removeFillers) {
    let i = 0;
    while (i < words.length) {
      const bigram = i + 1 < words.length
        ? `${normalizeWord(words[i].word)} ${normalizeWord(words[i + 1].word)}`
        : null;
      if (bigram && FILLER_BIGRAMS.has(bigram)) {
        cuts.push({ startMs: words[i].start, endMs: words[i + 1].end });
        i += 2;
        continue;
      }
      if (FILLERS.has(normalizeWord(words[i].word))) {
        cuts.push({ startMs: words[i].start, endMs: words[i].end });
      }
      i += 1;
    }
  }

  if (removeSilence) {
    if (words.length > 0) {
      if (words[0].start > silenceThresholdMs) {
        cuts.push({ startMs: 0, endMs: words[0].start });
      }
      for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i+1].start - words[i].end;
        if (gap > silenceThresholdMs) {
          cuts.push({ startMs: words[i].end, endMs: words[i+1].start });
        }
      }
      const lastWordEnd = words[words.length - 1].end;
      if (durationMs - lastWordEnd > silenceThresholdMs) {
        cuts.push({ startMs: lastWordEnd, endMs: durationMs });
      }
    }
  }

  if (cuts.length === 0) {
    return { keeps: [{ startMs: 0, endMs: durationMs }], cuts: [] };
  }

  cuts.sort((a, b) => a.startMs - b.startMs);
  const mergedCuts: CutSegment[] = [cuts[0]];
  for (let i = 1; i < cuts.length; i++) {
    const last = mergedCuts[mergedCuts.length - 1];
    const cur = cuts[i];
    if (cur.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, cur.endMs);
    } else {
      mergedCuts.push(cur);
    }
  }

  const keeps: KeepSegment[] = [];
  let lastEnd = 0;
  for (const cut of mergedCuts) {
    if (cut.startMs > lastEnd) {
      keeps.push({ startMs: lastEnd, endMs: cut.startMs });
    }
    lastEnd = cut.endMs;
  }
  if (lastEnd < durationMs) {
    keeps.push({ startMs: lastEnd, endMs: durationMs });
  }

  const validKeeps = keeps.filter((k) => k.endMs - k.startMs > 50);
  if (validKeeps.length === 0) {
    return { keeps: [{ startMs: 0, endMs: durationMs }], cuts: [] };
  }

  return { keeps: validKeeps, cuts: mergedCuts };
}

/**
 * Map a time on the TRIMMED timeline back to the original one.
 * The inverse of shiftTime: walk the kept spans, consuming output time until
 * the target lands inside one.
 */
export function unshiftTime(outMs: number, keeps: KeepSegment[]): number {
  let consumed = 0;
  for (const k of keeps) {
    const span = k.endMs - k.startMs;
    if (outMs <= consumed + span) return k.startMs + (outMs - consumed);
    consumed += span;
  }
  return keeps.length > 0 ? keeps[keeps.length - 1].endMs : outMs;
}

/**
 * Re-index a signal track onto the trimmed timeline so the cinematic layer
 * reacts to the audio that is actually in the rendered clip.
 */
export function remapSignalTrack(signal: SignalTrack, keeps: KeepSegment[], newDurationSec: number): SignalTrack {
  const hz = signal.hz || 20;
  const n = Math.max(1, Math.round(newDurationSec * hz));
  const resample = (values: number[]): number[] => {
    if (values.length === 0) return [];
    return Array.from({ length: n }, (_, i) => {
      const originalSec = unshiftTime((i / hz) * 1000, keeps) / 1000;
      const idx = Math.round(originalSec * hz);
      return values[Math.max(0, Math.min(values.length - 1, idx))];
    });
  };

  return {
    ...signal,
    rms: resample(signal.rms),
    pitch: resample(signal.pitch),
    energy: resample(signal.energy),
    // Shot boundaries and pauses that fell inside a removed span no longer
    // exist; the rest move forward.
    scenes: signal.scenes
      .filter((s) => keeps.some((k) => s * 1000 >= k.startMs && s * 1000 <= k.endMs))
      .map((s) => shiftTime(s * 1000, keeps) / 1000),
    pauses: signal.pauses
      .filter((p) => keeps.some((k) => p.start * 1000 >= k.startMs && p.start * 1000 <= k.endMs))
      .map((p) => ({ start: shiftTime(p.start * 1000, keeps) / 1000, end: shiftTime(p.end * 1000, keeps) / 1000 })),
  };
}

function shiftTime(tMs: number, keeps: KeepSegment[]): number {
  let prevKeptDuration = 0;
  for (let i = 0; i < keeps.length; i++) {
    const k = keeps[i];
    if (tMs >= k.startMs && tMs <= k.endMs) {
      return prevKeptDuration + (tMs - k.startMs);
    }
    if (tMs < k.startMs) {
      return prevKeptDuration;
    }
    prevKeptDuration += (k.endMs - k.startMs);
  }
  return prevKeptDuration;
}

// ── Per-clip render (shared by the batch render job and single-clip re-render) ─

/**
 * Applies the lite-editor pass to a finished clip, in place.
 *
 * Runs as its own encode over `clipPath` and swaps the result back, so the
 * main render is untouched by any of it. Returns the (possibly changed)
 * duration. Best-effort: if the pass fails the original render stands rather
 * than the whole clip failing over a music bed.
 */
async function applyLiteEditsPass(args: {
  lite: LiteEdits;
  clipPath: string;
  litePath: string;
  musicPath: string;
  durationSec: number;
  words: WordTiming[] | null;
  target: RenderTarget;
}): Promise<number> {
  const { lite, clipPath, litePath, musicPath, durationSec, words, target } = args;

  let downloadedMusic: string | null = null;
  if (lite.music?.url) {
    try {
      await downloadFile(lite.music.url, musicPath);
      downloadedMusic = musicPath;
    } catch (err) {
      logger.warn("auto-clip", "music bed download failed, rendering without it", err);
    }
  }

  // Duck the bed under speech using the already-written, previously-unused
  // envelope builder in lib/audio-ducking.ts.
  let duckExpr: string | null = null;
  if (downloadedMusic && lite.music?.duck && words && words.length > 0) {
    const speech = speechRangesFromWords(words);
    const segments = computeDuckEnvelope(speech, durationSec, {
      duckGain: lite.music.volume * 0.25,
      fullGain: lite.music.volume,
    });
    duckExpr = duckVolumeExpr(segments, lite.music.volume);
  }

  const plan = planLitePass(lite, durationSec, { musicPath: downloadedMusic, duckExpr });
  if (!plan.needed) return durationSec;

  try {
    await runFFmpegArgs([
      "-y", "-i", clipPath,
      ...plan.extraInputs.flatMap((p) => ["-i", p]),
      "-filter_complex", plan.filterComplex,
      "-map", plan.videoMap, "-map", plan.audioMap,
      ...encodeArgs(target),
      litePath,
    ]);
    fs.renameSync(litePath, clipPath);
    return plan.durationSec;
  } catch (err) {
    logger.warn("auto-clip", "lite-edit pass failed, keeping the base render", err);
    return durationSec;
  }
}

// Free-tier output treatment: cap the short edge at 720p and burn a corner
// "Clipiro" watermark. Chained after every other filter so it applies over
// captions/B-roll and can't be cropped away.
function watermarkFilterChain(): string {
  const font = resolveFontFile("Poppins").replace(/\\/g, "/").replace(/:/g, "\\:");
  return (
    `scale=w='if(gt(iw,ih),-2,min(720,iw))':h='if(gt(iw,ih),min(720,ih),-2)',` +
    `drawtext=fontfile='${font}':text='Clipiro':fontsize=h/18:fontcolor=white@0.6:` +
    `borderw=2:bordercolor=black@0.35:x=w-tw-24:y=h-th-24`
  );
}

async function renderOneClip(
  projectId: string,
  clip: Clip,
  videoPath: string,
  watermark = false,
  target: RenderTarget = "cpu",
): Promise<{ ok: boolean }> {
  // Each render gets its own directory rather than sharing os.tmpdir(). Two
  // reasons: concurrent clips (the pool added in P1.4) can no longer collide
  // on a filename, and a worker killed mid-render leaks one directory that is
  // trivially identifiable and sweepable — previously it leaked loose
  // multi-gigabyte files into the shared temp root with no way to tell them
  // apart from anything else's.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `autoclip-${clip.id}-`));
  const clipPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.mp4`);
  const thumbPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.jpg`);
  const assPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.ass`);
  const brollPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}-broll.mp4`);
  const scriptPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}.filter`);
  const litePath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}-lite.mp4`);
  const musicPath = path.join(tmp, `${projectId}-clip${clip.index}-${clip.id}-music.mp3`);

  try {
    await prisma.clip.update({ where: { id: clip.id }, data: { status: "rendering", progress: 5 } });

    const aspect = (clip.aspectRatio as Aspect) || "9:16";
    let stored = clip.cropKeyframes as unknown as StoredCrop | null;
    const moodKey = (clip.mood && (MOODS as readonly string[]).includes(clip.mood)) ? (clip.mood as MoodTag) : "neutral";
    const moodFilter = FILTER_PRESETS[MOOD_TO_FILTER[moodKey]].ffmpeg;

    // Load silence and filler removal settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const silenceOpts = (clip.silenceSettings as any) ?? {};
    const removeSilence = !!silenceOpts.removeSilence;
    const silenceThresholdMs = (silenceOpts.silenceThresholdMs as number) ?? 400;
    const removeFillers = !!silenceOpts.removeFillers;

    let words = clip.transcriptJson as unknown as WordTiming[] | null;
    let keeps: KeepSegment[] = [];
    let isTrimmed = false;
    let finalDurationSec = clip.durationSec;

    if (words && words.length > 0 && (removeSilence || removeFillers)) {
      const result = computeKeeps(words, clip.durationSec, removeSilence, silenceThresholdMs, removeFillers);
      if (result.cuts.length > 0) {
        keeps = result.keeps;
        isTrimmed = true;

        // Shift word timings
        words = words
          .filter((w) => {
            const mid = (w.start + w.end) / 2;
            return keeps.some((k) => mid >= k.startMs && mid <= k.endMs);
          })
          .map((w) => ({
            word: w.word,
            start: shiftTime(w.start, keeps),
            end: shiftTime(w.end, keeps),
          }));

        // Shift crop keyframes
        if (stored) {
          if (stored.mode === "single") {
            stored = {
              mode: "single",
              keyframes: stored.keyframes
                .filter((kf) => keeps.some((k) => kf.tSec * 1000 >= k.startMs && kf.tSec * 1000 <= k.endMs))
                .map((kf) => ({
                  ...kf,
                  tSec: shiftTime(kf.tSec * 1000, keeps) / 1000,
                })),
            };
          } else if (stored.mode === "split") {
            stored = {
              mode: "split",
              a: stored.a
                .filter((kf) => keeps.some((k) => kf.tSec * 1000 >= k.startMs && kf.tSec * 1000 <= k.endMs))
                .map((kf) => ({ ...kf, tSec: shiftTime(kf.tSec * 1000, keeps) / 1000 })),
              b: stored.b
                .filter((kf) => keeps.some((k) => kf.tSec * 1000 >= k.startMs && kf.tSec * 1000 <= k.endMs))
                .map((kf) => ({ ...kf, tSec: shiftTime(kf.tSec * 1000, keeps) / 1000 })),
            };
          }
        }

        finalDurationSec = keeps.reduce((s, k) => s + (k.endMs - k.startMs), 0) / 1000;

        // Update database with the trimmed duration, transcript, and keyframes
        await prisma.clip.update({
          where: { id: clip.id },
          data: {
            durationSec: finalDurationSec,
            transcriptJson: words as unknown as Prisma.InputJsonValue,
            cropKeyframes: (stored ? stored : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    let signal = (clip.signalTrack as unknown as SignalTrack | null) ?? null;

    // The signal track is indexed on the clip's ORIGINAL timeline. Silence and
    // filler removal shorten that timeline, so without remapping, the camera
    // and captions would react to moments that have been cut out — drifting
    // further out of sync the more was removed. Same problem the word timings
    // and crop keyframes above already solve, so it uses the same keeps.
    if (signal && isTrimmed && keeps.length > 0) {
      signal = remapSignalTrack(signal, keeps, finalDurationSec);
    }

    // Lite-editor adjustments (speed, music bed, fades) are applied as a
    // separate pass AFTER this render — see applyLiteEditsPass. Doing them
    // here would mean rescaling every time-indexed artifact the clip owns
    // (words, crop keyframes, B-roll window, signal track) and threading three
    // filtergraph branches; doing them afterwards means captions and the zoom
    // path are already pixels and scale with the video for free, which cannot
    // desync. The cost is one extra encode on clips that use the lite editor.
    const lite = parseLiteEdits(clip.liteEdits);

    // Energy-reactive camera (P2.2). The zoom curve is layered onto whatever
    // crop path the layout produced, so it composes with speaker tracking
    // rather than replacing it — the camera keeps following the subject and
    // tightens around them when the delivery intensifies.
    if (signal && signal.energy?.length > 0 && stored?.mode === "single" && stored.keyframes.length > 0) {
      const zoomStrength = (silenceOpts.zoomStrength as "low" | "medium" | "high") ?? "medium";
      const smartOn = silenceOpts.smartAutoReframe !== false;
      if (smartOn) {
        const curve = buildCameraZoom(signal, finalDurationSec, { maxZoom: ZOOM_STRENGTH_MAX[zoomStrength] });
        stored = { mode: "single", keyframes: applyZoomToKeyframes(stored.keyframes, curve) };
      }
    }

    let assEscaped: string | null = null;
    if (clip.hasCaptions && words && words.length > 0) {
      // Resolve custom subtitle style overrides if they exist
      let style = styleIndexToSubtitleStyle(clip.captionStyleIndex ?? 0, "oneword");
      const customStyle = clip.subtitleStyleOverride as unknown as SubtitleStyle | null;
      if (customStyle) {
        style = { ...style, ...customStyle };
      }
      // Caption animation reads the SAME energy envelope the camera does, so
      // the two agree about where the emphasis is instead of each reacting on
      // its own — that disagreement is what makes auto-captions look amateur.
      // A caption template, if one is chosen, supplies the look AND whether
      // emoji/keyword colouring apply — one named decision instead of a dozen
      // colour pickers.
      const template = getCaptionTemplate((clip.subtitleStyleOverride as Record<string, unknown> | null)?.templateId as string | undefined);
      if (template) style = { ...template.style, ...customStyle };

      if (signal && signal.energy?.length > 0) {
        style = {
          ...style,
          motion: {
            energy: words.map((w) => sampleAt(signal.energy, w.start / 1000, signal.hz)),
            emphasis: signal.emphasis ?? [],
            wordsPerSec: signal.wordsPerSec,
            emoji: planEmoji(words, template?.emoji ?? false),
            keywordColor: template?.keywordColor,
          },
        };
      }
      generateASS(words, style, assPath);
      assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    }
    const captionsFilter = assEscaped ? `subtitles='${assEscaped}'` : null;

    const baseArgs = ["-y", "-ss", String(clip.startSec), "-to", String(clip.endSec), "-i", videoPath];
    const outputArgs = encodeArgs(target);

    let selectFilter: string | null = null;
    let aselectFilter: string | null = null;
    if (isTrimmed && keeps.length > 0) {
      const parts = keeps.map((k) => `between(t,${(k.startMs / 1000).toFixed(3)},${(k.endMs / 1000).toFixed(3)})`);
      selectFilter = `select='${parts.join("+")}',setpts=PTS-STARTPTS`;
      aselectFilter = `aselect='${parts.join("+")}',asetpts=PTS-STARTPTS`;
    }

    // B-roll downloads are best-effort: any window that fails is dropped and
    // the clip renders with whatever succeeded (or none at all), rather than
    // failing over a stock clip.
    const plannedWindows: { startSec: number; endSec: number; url: string }[] =
      (clip.brollWindows as unknown as { startSec: number; endSec: number; url: string }[] | null)
      ?? (clip.brollUrl && clip.brollStartSec != null && clip.brollEndSec != null
        ? [{ startSec: clip.brollStartSec, endSec: clip.brollEndSec, url: clip.brollUrl }]
        : []);

    const readyWindows: { startSec: number; endSec: number; path: string }[] = [];
    for (const [i, w] of plannedWindows.entries()) {
      const dest = i === 0 ? brollPath : `${brollPath}-${i}.mp4`;
      try {
        await downloadFile(w.url, dest);
        readyWindows.push({ startSec: w.startSec, endSec: w.endSec, path: dest });
      } catch (err) {
        logger.warn("auto-clip", `B-roll window ${i} failed for clip ${clip.index}, skipping it`, err);
      }
    }
    const brollReady = readyWindows.length > 0;

    const videoSrc = isTrimmed ? "[trimmedv]" : "[0:v]";
    const audioSrc = isTrimmed ? "[trimmeda]" : "0:a";
    const prepends = isTrimmed && selectFilter && aselectFilter ? `[0:v]${selectFilter}[trimmedv];[0:a]${aselectFilter}[trimmeda];` : "";
    // Complex branches expose their result as [video]; chain the free-tier
    // watermark onto it and remap. The -vf branch just appends the chain.
    const wmComplex = watermark ? `;[video]${watermarkFilterChain()}[videowm]` : "";
    const videoMap = watermark ? "[videowm]" : "[video]";

    // `useBroll` is a parameter rather than just reading `brollReady`, so the
    // render can be retried with B-roll forced off (see below). The B-roll
    // splice uses a much heavier -filter_complex + concat graph with one looped
    // input per window; on some hosts/inputs that graph fails where the plain
    // -vf path renders fine — a mid-stream filter reinit the concat path can't
    // survive, or the extra filter/encoder threads tripping a constrained
    // host's resource limit (the -11 EAGAIN "Could not open encoder" seen in
    // prod logs). Building args in one place keeps the retry identical bar B-roll.
    const buildRenderArgs = (useBroll: boolean): string[] => {
      if (useBroll && brollReady) {
        // Silence removal shifts the clip's timeline, so the windows move with it.
        const shifted = readyWindows
          .map((w) => ({
            ...w,
            startSec: isTrimmed ? shiftTime(w.startSec * 1000, keeps) / 1000 : w.startSec,
            endSec: isTrimmed ? shiftTime(w.endSec * 1000, keeps) / 1000 : w.endSec,
          }))
          .filter((w) => w.endSec > w.startSec && w.startSec < finalDurationSec)
          .sort((a, b) => a.startSec - b.startSec);

        // Speaker tracking now survives a B-roll splice (P2.6).
        const brollKeyframes = stored?.mode === "single" && stored.keyframes.length > 1 ? stored.keyframes : null;
        const complex = prepends + buildMultiBrollFilterComplex(
          finalDurationSec, shifted, aspect, moodFilter, captionsFilter, videoSrc,
          brollKeyframes ? buildDynamicCropFilter(brollKeyframes, aspect) : null,
        ) + wmComplex;
        return [
          ...baseArgs,
          // Each window is its own input, looped so a short stock clip still
          // covers its window.
          ...shifted.flatMap((w) => ["-stream_loop", "-1", "-i", w.path]),
          "-filter_complex", complex, "-map", videoMap, "-map", audioSrc,
          ...outputArgs, "-shortest", clipPath,
        ];
      }
      if (stored?.mode === "split" && stored.a.length > 1 && stored.b.length > 1) {
        // Two-speaker split-screen: two independent dynamic crops, vstacked.
        const complex = prepends + buildSplitScreenFilterComplex(stored.a, stored.b, moodFilter, captionsFilter, videoSrc) + wmComplex;
        return [...baseArgs, "-filter_complex", complex, "-map", videoMap, "-map", audioSrc, ...outputArgs, "-shortest", clipPath];
      }
      const keyframes = stored?.mode === "single" ? stored.keyframes : null;
      const cropExpr = keyframes && keyframes.length > 1
        ? buildDynamicCropFilter(keyframes, aspect)
        : aspectRatioFilter(aspect);
      const filters = [cropExpr, moodFilter, captionsFilter].filter((f): f is string => !!f);
      if (isTrimmed && selectFilter) {
        filters.unshift(selectFilter);
      }
      if (watermark) filters.push(watermarkFilterChain());
      return [...baseArgs, "-vf", filters.join(","), ...(isTrimmed && aselectFilter ? ["-af", aselectFilter] : []), ...outputArgs, clipPath];
    };

    const onRenderProgress = (pct: number) => {
      void prisma.clip.update({ where: { id: clip.id }, data: { progress: Math.round(5 + pct * 0.75) } }).catch(() => {});
    };
    // The pan/zoom expressions can push the filtergraph past the command-line
    // length limit on long clips; spill it to a file when that happens.
    const renderOnce = (useBroll: boolean) => timeStage(
      "render",
      () => runFFmpegWithProgress(maybeUseFilterScript(buildRenderArgs(useBroll), scriptPath), onRenderProgress),
      // `target` is what makes the CPU-vs-GPU comparison measurable rather
      // than assumed — see gpu-service/README.md's ROI note.
      { target, meta: { durationSec: Math.round(finalDurationSec), aspect, broll: useBroll && brollReady } },
    );

    try {
      await renderOnce(brollReady);
    } catch (err) {
      if (!brollReady) throw err;
      // B-roll is a best-effort enhancement (already best-effort at the download
      // step) — a splice that ffmpeg can't render must not cost the user the
      // whole clip. Retry without it: the exact path a B-roll-less clip takes,
      // so the clip still renders (just without the stock cutaways).
      logger.warn("auto-clip", `B-roll render failed for clip ${clip.index}, retrying without B-roll`, err);
      await renderOnce(false);
    }

    // Lite-editor pass: speed / fades / music bed over the finished clip.
    if (lite) {
      finalDurationSec = await applyLiteEditsPass({
        lite, clipPath, litePath, musicPath, durationSec: finalDurationSec, words, target,
      });
    }

    await prisma.clip.update({ where: { id: clip.id }, data: { progress: 82 } });
    await runFFmpegArgs([
      "-y", "-ss", String(finalDurationSec / 2), "-i", clipPath,
      "-frames:v", "1", "-vf", "scale=480:-2", thumbPath,
    ]).catch(() => {});

    // Calibrated scoring (P2.4) — refine Gemini's sub-scores with signals
    // measured off the actual rendered clip's audio.
    const analysis = await analyzeAudio(clipPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullBreakdown = (clip.scoreBreakdown as any) ?? {};
    const sub = {
      hook: fullBreakdown.hook ?? 50,
      pacing: fullBreakdown.pacing ?? 50,
      payoff: fullBreakdown.payoff ?? 50,
      engagement: fullBreakdown.engagement ?? 50,
    };
    const weights = await getViralityWeights();
    const breakdown = calibrateScore(sub, analysis, finalDurationSec, words?.length ?? 0, weights);

    await prisma.clip.update({ where: { id: clip.id }, data: { progress: 90 } });
    const videoUrl = await uploadFileToS3(clipPath, `renders/${projectId}/clip-${clip.index}.mp4`, "video/mp4");
    const thumbnailUrl = fs.existsSync(thumbPath)
      ? await uploadFileToS3(thumbPath, `renders/${projectId}/clip-${clip.index}.jpg`, "image/jpeg").catch(() => null)
      : null;

    // Waveform peaks for the editor scrubber, computed here from the finished
    // clip so the browser never has to decode audio (a multi-hour source would
    // hang the tab) and so they match exactly what the user is looking at.
    const audioPeaks = await computeAudioPeaks(clipPath);

    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        status: "ready", progress: 100, videoUrl, thumbnailUrl,
        durationSec: finalDurationSec,
        renderTarget: target,
        ...(audioPeaks.length > 0 ? { audioPeaks: audioPeaks as unknown as Prisma.InputJsonValue } : {}),
        score: breakdown.composite,
        scoreBreakdown: {
          ...fullBreakdown,
          ...breakdown,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true };
  } catch (err) {
    logger.error("auto-clip", `clip ${clip.index} failed for ${projectId}`, err);
    await prisma.clip.update({ where: { id: clip.id }, data: { status: "failed" } }).catch(() => {});
    return { ok: false };
  } finally {
    // One directory to remove, rather than a list of files to keep in sync
    // with every new intermediate the renderer learns to produce.
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
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
    // Pre-trim (charged, per confirm/route.ts) vs. post-trim (actually
    // rendered) total duration across successfully-rendered clips — feeds
    // the trimmed-duration refund below.
    let preTrimTotalSec = 0;
    let postTrimTotalSec = 0;
    // Tier decided once per run, inside the worker, so it's correct even for
    // jobs queued across an upgrade.
    const { getUserTier } = await import("@/lib/auth");
    const watermark = (await getUserTier(project.userId)) === "free";

    // Where each clip encodes. Resolved once per run rather than per clip: it
    // depends on the user's tier and the source dimensions, neither of which
    // varies within a run, and it costs a Config read plus a Redis check.
    const { w: srcW, h: srcH } = await getMediaDimensions(videoPath);
    const { resolveRenderTarget } = await import("@/lib/render-target");
    const longestClipSec = clips.reduce((m, c) => Math.max(m, c.durationSec), 0);
    const target = await resolveRenderTarget(project.userId, {
      sourceW: srcW, sourceH: srcH, clipDurationSec: longestClipSec,
    });

    // Clips were rendered strictly one after another, so a 20-clip project
    // took 20x one clip's wall time on a machine with idle cores. They're
    // independent — same read-only source file, separate temp paths, separate
    // DB rows — so a bounded pool is safe and is the single biggest
    // improvement to the time a user actually experiences.
    //
    // The bound matters: each render is itself multi-threaded ffmpeg, so
    // unbounded parallelism would thrash. RENDER_CLIP_CONCURRENCY tunes it per
    // deployment; 3 is a reasonable default for a small VPS.
    const poolSize = Math.max(1, Math.min(
      parseInt(env.RENDER_CLIP_CONCURRENCY || "3", 10) || 3,
      clips.length,
    ));

    const queue = [...clips];
    const runWorker = async () => {
      for (;;) {
        const clip = queue.shift();
        if (!clip) return;
        const { ok } = await renderOneClip(projectId, clip, videoPath, watermark, target);
        if (!ok) continue;
        const updated = await prisma.clip.findUnique({
          where: { id: clip.id },
          select: { videoUrl: true, score: true, durationSec: true },
        });
        // Mutating shared counters is safe here: Node is single-threaded, and
        // there is no await between reading and writing them.
        readyCount++;
        if (updated?.videoUrl && (updated.score ?? 0) > bestScore) {
          bestScore = updated.score ?? 0;
          bestUrl = updated.videoUrl;
        }
        // clip.durationSec here is still the pre-render (reviewed/charged)
        // value — renderOneClip only mutates the DB row, not this in-memory
        // `clip`, so capturing it now is exactly the "what was charged" figure.
        preTrimTotalSec += clip.durationSec;
        postTrimTotalSec += updated?.durationSec ?? clip.durationSec;
      }
    };
    await Promise.all(Array.from({ length: poolSize }, runWorker));

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

    // Trimmed-duration refund — filler/silence removal (computeKeeps, applied
    // inside renderOneClip) runs *after* confirm/route.ts has already charged
    // for the reviewed, pre-trim clip windows, so a clip that gets
    // substantially shortened by auto-trimming was still billed at its
    // original length. Only the per-two-minutes portion of the price is
    // duration-sensitive (the per-clip charge is unaffected either way), so
    // refund exactly that delta in credit-block terms.
    if (postTrimTotalSec < preTrimTotalSec) {
      const pricing = await getAutoClipPricing();
      const blockDelta = Math.ceil(preTrimTotalSec / 120) - Math.ceil(postTrimTotalSec / 120);
      if (blockDelta > 0) {
        await refundCredits(projectId, blockDelta * pricing.perTwoMinutes);
      }
    }

    if (readyCount === 0) {
      await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } });
    } else {
      await prisma.project.update({ where: { id: projectId }, data: { status: "completed", videoUrl: bestUrl } });
    }
  } catch (err) {
    logger.error("auto-clip", `render failed for ${projectId}`, err);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed", failureReason: userFacingFailure(err) },
    }).catch(() => {});
    // See pickJob's matching comment — rethrow so BullMQ's attempts:3/backoff
    // actually retries transient failures instead of stopping after one try.
    throw err;
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

  // Imported lazily to avoid a module-scope cycle: lib/autoclip-rerender.ts
  // registers its queue with this file's rerenderJob at import time. Same
  // pattern as the getUserTier imports elsewhere in this module.
  const { refundFailedRerender } = await import("@/lib/autoclip-rerender");

  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src-rerender-${clipId}.mp4`);
  try {
    await downloadFile(project.uploadedVideoUrl, videoPath);

    let updatedClip = clip;
    const allFaces = await loadFaceTimeline(project);
    if (allFaces && allFaces.length > 0) {
      const { w: srcW, h: srcH } = await getMediaDimensions(videoPath);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const silenceOpts = (clip.silenceSettings as any) ?? {};
      const preset = silenceOpts.reframingPreset ?? "balanced";

      const dummySeg = {
        start: clip.startSec,
        end: clip.endSec,
        title: clip.title ?? "",
        hook: 50, pacing: 50, payoff: 50, engagement: 50,
        mood: (clip.mood as MoodTag) ?? "neutral",
        brollQuery: clip.brollQuery,
        brollOffsetSec: null,
        reasoning: "", hookExplanation: "", retentionPrediction: "", audience: "", platform: "", suggestedPostingTime: "", hashtags: [], suggestedCaption: "",
        // Re-render reuses the clip's persisted signal track, so the emphasis
        // the model originally found is already baked into it — nothing to
        // re-derive here.
        emphasisWords: [], emphasisWordIndexes: [], brollCues: [],
      };

      const cropKeyframes = clip.brollUrl ? null : computeStoredCrop(allFaces, dummySeg, clip.aspectRatio as Aspect, srcW, srcH, {
        preset,
        smartAutoReframe: silenceOpts.smartAutoReframe !== false,
        zoomStrength: silenceOpts.zoomStrength ?? "medium",
        speakerMode: silenceOpts.speakerMode ?? "auto",
        smoothness: silenceOpts.smoothness ?? 50,
        trackingSpeed: silenceOpts.trackingSpeed ?? 50,
        words: clip.transcriptJson as unknown as WordTiming[],
      });
      updatedClip = await prisma.clip.update({
        where: { id: clipId },
        data: {
          cropKeyframes: (cropKeyframes ? cropKeyframes : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const { getUserTier } = await import("@/lib/auth");
    const watermark = (await getUserTier(project.userId)) === "free";
    const { ok } = await renderOneClip(projectId, updatedClip, videoPath, watermark);
    // renderOneClip swallows its own error and marks the clip failed, so a
    // failed re-render used to leave the user charged for a clip they never
    // received — the batch path refunds, this one never did.
    if (!ok) await refundFailedRerender(clipId);
  } catch (err) {
    // Anything thrown before/around renderOneClip (a failed source download,
    // for instance) would otherwise leave the clip stuck on "queued" forever
    // with the charge still standing. (This is the same "stuck forever" bug the
    // studio-insights branch fixed by rethrowing for a BullMQ retry — the newer
    // refund-and-fail path here supersedes it: the user is made whole rather
    // than retried against an already-expired source.)
    logger.error("auto-clip", `rerender failed for clip ${clipId}`, err);
    await prisma.clip.update({ where: { id: clipId }, data: { status: "failed" } }).catch(() => {});
    await refundFailedRerender(clipId);
    throw err;
  } finally {
    try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch {}
  }
}
