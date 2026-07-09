// Calibrated virality scoring (AutoClip P2.4). The old score was a single
// unvalidated number Gemini made up. This blends structured LLM sub-scores
// (still subjective, but decomposed instead of one opaque integer) with
// signals measured directly off the rendered clip's audio — loudness dynamic
// range, speech rate, and silence ratio — combined deterministically so the
// same clip always scores the same way instead of depending on LLM sampling
// noise. Not a trained model: there's no labeled engagement data to train one
// against yet (see ClipPublish / lib/social/refresh-queue.ts, which is what
// would eventually supply that data).

import type { AudioAnalysis } from "@/utils/ffmpeg-render";

export interface SubScores {
  hook: number;
  pacing: number;
  payoff: number;
  engagement: number;
}

export interface ScoreBreakdown extends SubScores {
  audio: number;
  speechRate: number;
  composite: number;
}

function clamp99(n: number): number {
  return Math.max(0, Math.min(99, Math.round(n)));
}

export function calibrateScore(
  sub: SubScores,
  analysis: AudioAnalysis,
  clipDurationSec: number,
  wordCount: number,
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
    llmAvg * 0.55 + audioScore * 0.2 + speechRateScore * 0.15 + silenceScore * 0.1,
  );

  return { ...sub, audio: audioScore, speechRate: speechRateScore, composite };
}
