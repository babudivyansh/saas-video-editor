// Calibrated virality scoring (AutoClip P2.4). The old score was a single
// unvalidated number Gemini made up. This blends structured LLM sub-scores
// (still subjective, but decomposed instead of one opaque integer) with
// signals measured directly off the rendered clip's audio — loudness dynamic
// range, speech rate, and silence ratio — combined deterministically so the
// same clip always scores the same way instead of depending on LLM sampling
// noise. Composite weights default to a hand-tuned starting point but are
// overridable (see ViralityWeights/getViralityWeights below and
// lib/virality-calibration.ts) once there's enough real ClipPublish
// engagement data to justify recalibrating them — see ClipPublish /
// lib/social/refresh-queue.ts, which is what supplies that data.

import type { AudioAnalysis } from "@/utils/ffmpeg-render";
import { prisma } from "@/lib/prisma";

export interface SubScores {
  hook: number;
  pacing: number;
  payoff: number;
  engagement: number;
}

export interface ScoreBreakdown extends SubScores {
  audio: number;
  speechRate: number;
  silence: number;
  composite: number;
}

export interface ViralityWeights {
  llm: number;
  audio: number;
  speechRate: number;
  silence: number;
}

// The original hand-picked weights — the safe default until
// recalibrateViralityWeights() (lib/virality-calibration.ts) has enough
// labeled outcomes to justify overriding them.
export const DEFAULT_VIRALITY_WEIGHTS: ViralityWeights = { llm: 0.55, audio: 0.2, speechRate: 0.15, silence: 0.1 };

// Admin-adjustable via the same Config-table pattern as getAutoClipPricing
// (lib/autoclip-pipeline.ts) — recalibration writes here, this reads it.
export async function getViralityWeights(): Promise<ViralityWeights> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "autoclip_virality_weights" } });
    if (!row) return DEFAULT_VIRALITY_WEIGHTS;
    const parsed = JSON.parse(row.value) as Partial<ViralityWeights>;
    return { ...DEFAULT_VIRALITY_WEIGHTS, ...parsed };
  } catch {
    return DEFAULT_VIRALITY_WEIGHTS;
  }
}

function clamp99(n: number): number {
  return Math.max(0, Math.min(99, Math.round(n)));
}

export function calibrateScore(
  sub: SubScores,
  analysis: AudioAnalysis,
  clipDurationSec: number,
  wordCount: number,
  weights: ViralityWeights = DEFAULT_VIRALITY_WEIGHTS,
): ScoreBreakdown {
  const llmAvg = (sub.hook + sub.pacing + sub.payoff + sub.engagement) / 4;

  // Dynamic range (max - mean volume) as a proxy for expressive/energetic
  // delivery — flat, monotone audio compresses this; animated delivery widens it.
  const dynamicRangeDb = Math.max(0, analysis.maxVolumeDb - analysis.meanVolumeDb);
  const audioScore = clamp99((dynamicRangeDb / 20) * 99);

  // 2-3.5 words/sec is a natural, energetic short-form speaking pace; scores
  // fall off the further a clip drifts from that band in either direction.
  const wordsPerSec = clipDurationSec > 0 ? wordCount / clipDurationSec : 0;
  const speechRateScore = clamp99(99 - Math.abs(wordsPerSec - 2.75) * 40);

  const silenceRatio = clipDurationSec > 0 ? Math.min(1, analysis.silenceSec / clipDurationSec) : 0;
  const silenceScore = 99 * (1 - silenceRatio);

  const composite = clamp99(
    llmAvg * weights.llm + audioScore * weights.audio + speechRateScore * weights.speechRate + silenceScore * weights.silence,
  );

  return { ...sub, audio: audioScore, speechRate: speechRateScore, silence: silenceScore, composite };
}
