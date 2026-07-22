// Recalibrates virality-score composite weights (lib/virality-score.ts) using
// real engagement outcomes instead of the hand-picked 0.55/0.20/0.15/0.10
// starting weights — the fix that file's own header names as the intended
// direction once ClipPublish/lib/social/refresh-queue.ts has real data to
// supply. Ships behind an admin toggle (Config key
// "autoclip_calibration_enabled") and a minimum-sample-size guard: with too
// little labeled data, "recalibrating" is just overfitting noise, so the
// hand-tuned defaults stay in effect until there's enough real signal.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { DEFAULT_VIRALITY_WEIGHTS, type ScoreBreakdown, type ViralityWeights } from "@/lib/virality-score";

const MIN_SAMPLES = 50;
// A freshly-published clip's metrics are still climbing — only recalibrate
// against posts old enough that views/engagement have had time to settle.
const MIN_DWELL_DAYS = 3;

interface PublishMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}

function engagementRate(m: PublishMetrics | null | undefined): number | null {
  if (!m || !m.views || m.views <= 0) return null;
  const engagements = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  return engagements / m.views;
}

// Pearson correlation coefficient — how strongly a sub-signal tracks
// engagement rate across the sample, independent of the signal's own scale.
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

async function isCalibrationEnabled(): Promise<boolean> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "autoclip_calibration_enabled" } });
    return row?.value === "true";
  } catch {
    return false;
  }
}

export interface RecalibrationResult {
  updated: boolean;
  sampleSize: number;
  weights?: ViralityWeights;
}

// Joins Clip.scoreBreakdown against ClipPublish.metricsJson for clips with
// enough post-publish dwell time, correlates each sub-signal (LLM average,
// audio, speech rate, silence) against engagement rate, and — only with
// enough samples and a usable (non-zero) correlation signal — turns those
// correlations into new composite weights via the same admin-adjustable
// Config-table pattern autoclip_pricing already uses. A no-op (current
// weights untouched) whenever disabled, under-sampled, or degenerate.
export async function recalibrateViralityWeights(): Promise<RecalibrationResult> {
  if (!(await isCalibrationEnabled())) return { updated: false, sampleSize: 0 };

  const cutoff = new Date(Date.now() - MIN_DWELL_DAYS * 24 * 60 * 60 * 1000);
  const publishes = await prisma.clipPublish.findMany({
    where: { status: "linked", publishedAt: { lte: cutoff } },
    include: { clip: { select: { scoreBreakdown: true } } },
  });

  const llms: number[] = [], audios: number[] = [], speechRates: number[] = [], silences: number[] = [], engagements: number[] = [];
  for (const p of publishes) {
    const bd = p.clip.scoreBreakdown as unknown as ScoreBreakdown | null;
    if (!bd) continue;
    const rate = engagementRate(p.metricsJson as unknown as PublishMetrics | null);
    if (rate == null) continue;
    llms.push((bd.hook + bd.pacing + bd.payoff + bd.engagement) / 4);
    audios.push(bd.audio);
    speechRates.push(bd.speechRate);
    silences.push(bd.silence ?? 0);
    engagements.push(rate);
  }

  if (engagements.length < MIN_SAMPLES) {
    logger.info("virality-calibration", `only ${engagements.length} labeled samples (need ${MIN_SAMPLES}) — keeping current weights`);
    return { updated: false, sampleSize: engagements.length };
  }

  // Negative correlations get floored at 0 rather than kept as a "penalty"
  // weight — with this few features and this much real-world noise, a
  // negative reading is much more likely to be sampling noise than a
  // genuine inverse relationship worth encoding into the composite.
  const corr = {
    llm: Math.max(0, pearson(llms, engagements)),
    audio: Math.max(0, pearson(audios, engagements)),
    speechRate: Math.max(0, pearson(speechRates, engagements)),
    silence: Math.max(0, pearson(silences, engagements)),
  };
  const total = corr.llm + corr.audio + corr.speechRate + corr.silence;
  if (total <= 0) {
    logger.warn("virality-calibration", "no usable (positive) correlation in this sample — keeping current weights");
    return { updated: false, sampleSize: engagements.length };
  }

  const weights: ViralityWeights = {
    llm: corr.llm / total,
    audio: corr.audio / total,
    speechRate: corr.speechRate / total,
    silence: corr.silence / total,
  };

  await prisma.config.upsert({
    where: { key: "autoclip_virality_weights" },
    create: { key: "autoclip_virality_weights", value: JSON.stringify(weights) },
    update: { value: JSON.stringify(weights) },
  });
  logger.info("virality-calibration", `recalibrated from ${engagements.length} samples`, weights);
  return { updated: true, sampleSize: engagements.length, weights };
}

// Exported for admin tooling that wants to show "what would this look like"
// before/alongside the currently-live weights.
export { DEFAULT_VIRALITY_WEIGHTS };
