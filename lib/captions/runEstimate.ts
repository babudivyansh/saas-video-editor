// Prices a whole AutoClip run BEFORE it starts.
//
// Necessary because the review step is gone: there is no longer a moment,
// after analysis, where the user is shown a price and clicks Confirm. The
// charge has to happen at Generate — which is before anything is known about
// the source video except what the user typed into the form.
//
// So this is deliberately a WORST CASE, not a guess. It bills the requested
// clip count at the top of the chosen clip-length band, and
// lib/autoclip-pipeline.ts's settleRunCost() refunds the difference the moment
// real durations exist. Erring high and refunding is the only honest direction:
// erring low would mean charging a second time mid-run, after the user has
// already been told a price.

// The LEAF pricing module, not lib/autoclip-pipeline — this file is imported
// by the create page, and the pipeline pulls in prisma, ffmpeg and Gemini.
import { computeCreditCost, type AutoClipPricing } from "@/lib/autoclip-pricing";
import { estimateCaptionRenderCredits, type CaptionRenderPricing } from "./pricingDefaults";

export interface RunEstimateInput {
  clipCount: number;
  /** The upper bound of the user's chosen clip-length band, in seconds. */
  maxDurationSec: number;
  /** True when the chosen caption template is rendered by a paid provider. */
  premiumCaptions: boolean;
}

export interface RunEstimate {
  /** Credits for cutting and rendering the clips themselves. */
  renderCredits: number;
  /** Credits for premium caption rendering, 0 when a native style is chosen. */
  captionCredits: number;
  /** What the user is asked to pay up front. */
  total: number;
}

/**
 * Worst-case cost of a run.
 *
 * Note the analysis charge is NOT included: it is taken separately inside
 * pickJob and then subtracted from the run cost at settle time, so counting it
 * here would double it in the figure shown to the user.
 */
export function estimateRunCost(
  input: RunEstimateInput,
  pricing: AutoClipPricing,
  captionPricing: CaptionRenderPricing,
): RunEstimate {
  const clips = Math.max(1, Math.trunc(input.clipCount));
  const perClipSec = Math.max(1, input.maxDurationSec);

  const renderCredits = computeCreditCost(clips, clips * perClipSec, pricing);

  // Per clip, not per run: the provider bills each clip as its own render, and
  // rounds each one up to a whole billable minute. That rounding is why a
  // 12-second clip and a 59-second clip cost the same, and why this number is
  // so much larger than the render cost.
  const captionCredits = input.premiumCaptions
    ? clips * estimateCaptionRenderCredits(perClipSec, captionPricing)
    : 0;

  return { renderCredits, captionCredits, total: renderCredits + captionCredits };
}

/** Upper bound of each clip-length band the create form offers. */
export function bandMaxSeconds(minDuration: number, maxDuration: number): number {
  // The form sends the real min/max, so trust maxDuration — but bound it, since
  // it is client input and feeds a charge.
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) return 60;
  return Math.min(Math.max(maxDuration, minDuration || 1), 300);
}
