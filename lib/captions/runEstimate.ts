// Prices a whole AutoClip run BEFORE it starts (2026-09-26 Clip Minutes model).
//
// A run is paid in Clip Minutes — 1 per source minute, however many clips —
// taken exactly in pickJob once the duration is probed. When the duration is
// already known here (an uploaded or library file), the quote shows it.
//
// The only thing still charged up front in CREDITS is premium (provider-
// rendered) captions, as a worst-case HOLD: requested clips x the top of the
// clip-length band, per-clip billable minutes. Each caption render then
// charges its own refId and the hold is returned when the run settles.

// The LEAF pricing module, not lib/autoclip-pipeline — this file is imported
// by the create page, and the pipeline pulls in prisma, ffmpeg and Gemini.
import { billableSourceMinutes } from "@/lib/autoclip-pricing";
import { estimateCaptionRenderCredits, type CaptionRenderPricing } from "./pricingDefaults";

export interface RunEstimateInput {
  clipCount: number;
  /** The upper bound of the user's chosen clip-length band, in seconds. */
  maxDurationSec: number;
  /** True when the chosen caption template is rendered by a paid provider. */
  premiumCaptions: boolean;
  /** Source length when known before the run (uploaded or library file). */
  sourceDurationSec?: number | null;
}

export interface RunEstimate {
  /** Clip Minutes the run will use, or null when the source length is unknown
   *  until analysis (a URL import). */
  minutes: number | null;
  /** Credits held up front for premium captions, 0 for a native style. */
  captionCredits: number;
  /** Credits taken up front (the caption hold). Minutes are charged in pickJob. */
  total: number;
}

export function estimateRunCost(input: RunEstimateInput, captionPricing: CaptionRenderPricing): RunEstimate {
  const clips = Math.max(1, Math.trunc(input.clipCount));
  const perClipSec = Math.max(1, input.maxDurationSec);
  const minutes = input.sourceDurationSec != null && input.sourceDurationSec > 0
    ? billableSourceMinutes(input.sourceDurationSec)
    : null;

  // Per clip, not per run: the provider bills each clip as its own render, and
  // rounds each one up to a whole billable minute — a 12-second clip and a
  // 59-second clip cost the same.
  const captionCredits = input.premiumCaptions
    ? clips * estimateCaptionRenderCredits(perClipSec, captionPricing)
    : 0;

  return { minutes, captionCredits, total: captionCredits };
}

/** Upper bound of each clip-length band the create form offers. */
export function bandMaxSeconds(minDuration: number, maxDuration: number): number {
  // The form sends the real min/max, so trust maxDuration — but bound it, since
  // it is client input and feeds a charge.
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) return 60;
  return Math.min(Math.max(maxDuration, minDuration || 1), 300);
}
