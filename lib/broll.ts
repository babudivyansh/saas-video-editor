// Auto B-roll (AutoClip P2.3). Splices a short Pexels stock-video window into
// a clip while the original audio keeps playing — the lowest-priority, most-
// effort item in P2.3 per the agreed plan, so kept deliberately simple: one
// window per clip, chosen by Gemini's own judgment (a null brollQuery means
// "this clip doesn't need it"), sourced from the same Pexels integration the
// manual editor's stock panel already uses. Never blocks a render — any
// failure here just means no B-roll for that clip, same static/pan crop as
// before.

import { searchStockVideos, StockNotConfiguredError } from "@/lib/editor/stock-providers";
import { logger } from "@/lib/logger";

const MIN_CLIP_FOR_BROLL_SEC = 6;
const BROLL_DURATION_SEC = 2.5;
// Keep the window at least this far from either edge so the B-roll never
// covers the clip's opening hook or its closing payoff.
const EDGE_MARGIN_FRAC = 0.1;

// Gemini now sees the full transcript and can suggest where in the clip a
// visual aside actually fits (see brollOffsetSec on GeminiSegment) — use that
// when it gave one. Falls back to a fixed interior window (a third of the
// way in, clear of the hook) when it didn't, which was the only option
// before Gemini's schema included a timing suggestion.
export function computeBrollWindow(clipDurationSec: number, brollOffsetSec?: number | null): { startSec: number; endSec: number } | null {
  if (clipDurationSec < MIN_CLIP_FOR_BROLL_SEC) return null;
  const margin = clipDurationSec * EDGE_MARGIN_FRAC;
  const hasSuggestion = typeof brollOffsetSec === "number" && Number.isFinite(brollOffsetSec);
  const start = hasSuggestion
    ? Math.max(margin, Math.min(brollOffsetSec as number, clipDurationSec - margin - BROLL_DURATION_SEC))
    : clipDurationSec * 0.35;
  const end = Math.min(clipDurationSec - 1, start + BROLL_DURATION_SEC);
  if (end - start < 1) return null;
  return { startSec: start, endSec: end };
}

export async function pickBroll(query: string): Promise<{ downloadUrl: string } | null> {
  try {
    const results = await searchStockVideos(query, 1);
    if (results.length === 0) return null;
    return { downloadUrl: results[0].downloadUrl };
  } catch (err) {
    if (!(err instanceof StockNotConfiguredError)) {
      logger.warn("auto-clip", `B-roll search failed for "${query}"`, err);
    }
    return null;
  }
}
