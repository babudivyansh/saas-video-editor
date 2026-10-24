// Bridge between the retired integer caption-style index and template ids.
//
// AutoClip used to pick captions from a grid of 16 font/colour permutations
// selected by ARRAY INDEX. That grid is gone, replaced by the named template
// library. Two things still need the old vocabulary:
//
//  1. Existing rows. Clip and Project rows store an integer, and a clip with no
//     template id must still render in the look its integer meant.
//  2. The public v1 API. POST /api/v1/clips accepts `captionStyleIndex` and
//     GET /api/v1/projects/[id]/clips returns it, so the integer stays part of
//     a documented external contract. TEMPLATE_TO_INDEX keeps it meaningful.
//
// Pure and dependency-free apart from the shared catalogue.

import {
  CAPTION_TEMPLATES,
  DEFAULT_CAPTION_TEMPLATE_ID,
  resolveTemplateId,
  type CaptionFamilyId,
} from "@clipiro/shared/caption-templates";

/** The template a legacy index most closely resembles. */
export const INDEX_TO_TEMPLATE: Record<number, string> = {
  0: "clean",       // Classic: white + yellow highlight
  1: "studio",      // Cyan
  2: "documentary", // Serif Glow
  3: "documentary", // Serif Thin
  4: "clean",       // Italic
  5: "boardroom",   // Caps
  6: "neontrace",   // Green
  7: "boardroom",   // Impact Italic
  8: "boardroom",   // Caps Italic
  9: "redbox",      // Red Badge
  10: "slam",       // Impact
  11: "lowkey",     // Light
  12: "documentary", // Serif Yellow
  13: "slam",       // Impact Yellow
  14: "clean",      // Yellow
  15: "neontrace",  // Blue
};

/** The default for new runs and the fallback for an index outside 0–15. */
export const DEFAULT_TEMPLATE_ID = DEFAULT_CAPTION_TEMPLATE_ID;

/**
 * Legacy index → template id.
 *
 * `-1` is NOT a style, it is the "captions off" sentinel. Callers check for it
 * first; this returns null so a caller that forgets gets a loud null.
 */
export function templateIdForIndex(index: number | null | undefined): string | null {
  if (index == null || index < 0) return null;
  return INDEX_TO_TEMPLATE[index] ?? DEFAULT_TEMPLATE_ID;
}

/** Nearest legacy index for each family, for templates without a direct match. */
const FAMILY_INDEX: Record<CaptionFamilyId, number> = {
  viral: 7,
  karaoke: 0,
  box: 9,
  creator: 0,
  podcast: 1,
  minimal: 11,
  cinema: 2,
  retro: 6,
  desi: 7,
};

/** Canonical (lowest) index for templates that ARE an inverse of INDEX_TO_TEMPLATE. */
const DIRECT: Record<string, number> = Object.entries(INDEX_TO_TEMPLATE).reduce<Record<string, number>>((acc, [i, id]) => {
  if (!(id in acc)) acc[id] = Number(i);
  return acc;
}, {});

export const TEMPLATE_TO_INDEX: Record<string, number> = Object.fromEntries(
  CAPTION_TEMPLATES.map((t) => [t.id, DIRECT[t.id] ?? FAMILY_INDEX[t.family]]),
);

/** Template id (current or legacy) → legacy index. Unknown ids resolve to the default. */
export function indexForTemplateId(templateId: string | null | undefined): number {
  return TEMPLATE_TO_INDEX[resolveTemplateId(templateId)] ?? 0;
}
