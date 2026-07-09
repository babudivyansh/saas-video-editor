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

// Picks a fixed interior window rather than trusting Gemini's own timing —
// starting a third of the way in keeps the clip's opening hook (the reason
// it was picked as a highlight) on the original footage.
export function computeBrollWindow(clipDurationSec: number): { startSec: number; endSec: number } | null {
  if (clipDurationSec < MIN_CLIP_FOR_BROLL_SEC) return null;
  const start = clipDurationSec * 0.35;
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
