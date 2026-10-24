// Prices a whole AutoClip run BEFORE it starts (2026-09-26 Clip Minutes model).
//
// A run is paid in Clip Minutes — 1 per source minute, however many clips —
// taken exactly in pickJob once the duration is probed. When the duration is
// already known here (an uploaded or library file), the quote shows it.
// Captions cost nothing extra: every template renders in-house.

// The LEAF pricing module, not lib/autoclip-pipeline — this file is imported
// by the create page, and the pipeline pulls in prisma, ffmpeg and Gemini.
import { billableSourceMinutes } from "@/lib/autoclip-pricing";

export interface RunEstimateInput {
  /** Source length when known before the run (uploaded or library file). */
  sourceDurationSec?: number | null;
}

export interface RunEstimate {
  /** Clip Minutes the run will use, or null when the source length is unknown
   *  until analysis (a URL import). */
  minutes: number | null;
}

export function estimateRunCost(input: RunEstimateInput): RunEstimate {
  const minutes = input.sourceDurationSec != null && input.sourceDurationSec > 0
    ? billableSourceMinutes(input.sourceDurationSec)
    : null;
  return { minutes };
}

/** Upper bound of each clip-length band the create form offers. */
export function bandMaxSeconds(minDuration: number, maxDuration: number): number {
  // The form sends the real min/max, so trust maxDuration — but bound it, since
  // it is client input.
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) return 60;
  return Math.min(Math.max(maxDuration, minDuration || 1), 300);
}
