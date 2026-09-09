// Bridge between the retired integer caption-style index and template slugs.
//
// AutoClip used to pick captions from a grid of 16 font/colour permutations
// (lib/caption-styles.ts) selected by ARRAY INDEX. That grid is gone, replaced
// by the named template library. Two things still need the old vocabulary:
//
//  1. Existing rows. Every Clip and Project in production stores an integer,
//     and re-rendering one must not silently change how it looks. The backfill
//     migration and the render path both map through INDEX_TO_TEMPLATE.
//  2. The public v1 API. POST /api/v1/clips accepts `captionStyleIndex` and
//     GET /api/v1/projects/[id]/clips returns it, so the integer stays part of
//     a documented external contract even though no Clipiro UI produces one.
//     TEMPLATE_TO_INDEX keeps that field meaningful for API clients.
//
// Pure and dependency-free so both directions are unit-testable without a DB —
// the one import is the placeholder-family table, itself a plain object.

import { PLACEHOLDER_LOOK_BY_ID, PLACEHOLDER_LOOK_INDEX } from "@/lib/caption-templates";

/** The template a legacy index most closely resembles. */
export const INDEX_TO_TEMPLATE: Record<number, string> = {
  0: "clean",     // Classic — white + yellow highlight
  1: "podcast",   // Cyan — cyan is the podcast template's highlight
  2: "news",      // Serif Glow
  3: "news",      // Serif Thin
  4: "clean",     // Italic — no italic template; closest by colour
  5: "clean",     // Caps
  6: "neon",      // Green
  7: "hormozi",   // Impact Italic
  8: "clean",     // Caps Italic
  9: "podcast",   // Red Badge — boxed lower-third look
  10: "hormozi",  // Impact
  11: "clean",    // Light
  12: "news",     // Serif Yellow
  13: "hormozi",  // Impact Yellow
  14: "clean",    // Yellow
  15: "neon",     // Blue
};

/** Fallback for an index outside 0–15 (the create routes never validated this). */
export const DEFAULT_TEMPLATE_ID = "clean";

/**
 * Legacy index → template slug.
 *
 * `-1` is NOT a style, it is the "captions off" sentinel — callers must check
 * for it before calling here, and this returns null so a caller that forgets
 * gets a loud null rather than a silently wrong style.
 */
export function templateIdForIndex(index: number | null | undefined): string | null {
  if (index == null || index < 0) return null;
  return INDEX_TO_TEMPLATE[index] ?? DEFAULT_TEMPLATE_ID;
}

/**
 * Template slug → the nearest legacy index.
 *
 * Built by inverting INDEX_TO_TEMPLATE and keeping the LOWEST index per
 * template, so the mapping is deterministic and round-trips: index → slug →
 * index lands on a canonical representative rather than an arbitrary one.
 *
 * The 12 premium templates have no legacy equivalent at all — they map to the
 * closest native look's index, because the integer's only remaining job is to
 * give the v1 API and `styleIndexToSubtitleStyle` a sane BASE style to spread
 * the real template's values on top of.
 */
const CURATED_TEMPLATE_TO_INDEX: Record<string, number> = {
  // Native — the canonical (lowest) index for each.
  clean: 0,
  podcast: 1,
  news: 2,
  neon: 6,
  hormozi: 7,
  minimal: 11, // "Light" — the closest small/quiet legacy look
  // Premium — nearest native ancestor's index.
  "viral-bold-01": 7,
  "viral-bold-02": 13,
  "viral-punch": 10,
  "viral-beast": 10,
  "high-energy": 6,
  "creator-modern": 0,
  "creator-pop": 0,
  "podcast-bold": 1,
  "clean-minimal": 11,
  "clean-white": 0,
  "luxury-clean": 12,
  "professional-01": 2,
};

/**
 * The rest of the provider's library.
 *
 * These have no authored look, only a placeholder family, so their legacy
 * index is that family's — derived rather than hand-written, because 33
 * hand-written entries would be 33 chances to typo a slug that the v1 API then
 * reports wrongly forever.
 */
const PLACEHOLDER_TEMPLATE_TO_INDEX: Record<string, number> = Object.fromEntries(
  Object.entries(PLACEHOLDER_LOOK_BY_ID).map(([id, look]) => [id, PLACEHOLDER_LOOK_INDEX[look]]),
);

export const TEMPLATE_TO_INDEX: Record<string, number> = {
  ...CURATED_TEMPLATE_TO_INDEX,
  ...PLACEHOLDER_TEMPLATE_TO_INDEX,
};

/** Template slug → legacy index. Unknown slugs fall back to 0 (Classic). */
export function indexForTemplateId(templateId: string | null | undefined): number {
  if (!templateId) return 0;
  return TEMPLATE_TO_INDEX[templateId] ?? 0;
}
