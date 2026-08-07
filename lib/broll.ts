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

// ── Keyword-driven placement ───────────────────────────────────────────────
//
// One LLM-guessed offset per clip was the old model. What "B-roll keywords"
// actually means in this category is that the insert lands on the NOUN the
// speaker says — the shot of a city appears as they say "city", not eight
// seconds later. The model now returns visual cues tied to words, and this
// resolves them to windows.

export interface BrollCue {
  /** The word that triggers the insert, verbatim from the transcript. */
  word: string;
  /** Stock search term for the visual. */
  query: string;
}

export interface BrollPlacement {
  startSec: number;
  endSec: number;
  query: string;
}

/** Minimum gap between inserts, so a clip doesn't become a slideshow. */
const MIN_SPACING_SEC = 6;
export const MAX_BROLL_WINDOWS = 3;

/**
 * Resolve keyword cues to non-overlapping windows on the clip's timeline.
 *
 * Placement rules exist because cutting away at the wrong moment is worse
 * than not cutting away at all: never over the hook or the payoff, never
 * back-to-back, and never so many that the speaker disappears from their own
 * clip.
 */
export function planBrollWindows(
  cues: BrollCue[],
  words: { word: string; start: number; end: number }[],
  clipDurationSec: number,
  maxWindows = MAX_BROLL_WINDOWS,
): BrollPlacement[] {
  if (clipDurationSec < MIN_CLIP_FOR_BROLL_SEC || cues.length === 0 || words.length === 0) return [];

  const margin = clipDurationSec * EDGE_MARGIN_FRAC;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
  const used = new Set<number>();
  const placements: BrollPlacement[] = [];

  for (const cue of cues) {
    if (placements.length >= maxWindows) break;
    const target = norm(cue.word);
    if (!target || !cue.query?.trim()) continue;

    const idx = words.findIndex((w, i) => !used.has(i) && norm(w.word) === target);
    if (idx < 0) continue;

    // Start just after the word is spoken — cutting away ON the word hides
    // the moment of recognition that makes the cut land.
    const start = words[idx].end / 1000 + 0.15;
    const end = start + BROLL_DURATION_SEC;
    if (start < margin || end > clipDurationSec - margin) continue;
    if (placements.some((p) => Math.abs(p.startSec - start) < MIN_SPACING_SEC)) continue;

    used.add(idx);
    placements.push({ startSec: start, endSec: end, query: cue.query.trim().slice(0, 60) });
  }

  return placements.sort((a, b) => a.startSec - b.startSec);
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
