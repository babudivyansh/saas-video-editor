// Sanitizes the caption fields on the two AutoClip create routes.
//
// Written as one shared helper because there are TWO create routes with
// identical bodies — app/api/generate/auto-clip/route.ts (the dashboard) and
// app/api/v1/clips/route.ts (the public API key surface) — and every previous
// field on them was sanitized independently in each file. `captionStyleIndex`
// was the one field neither validated: both did a bare
// `body.captionStyleIndex ?? 0`, so a client could send `9999`, `-5`, `1.5` or
// a string and the only backstop was a clamp buried in
// styleIndexToSubtitleStyle. This closes that, once, for both.

import { CAPTION_TEMPLATES } from "@/lib/caption-templates";
import { templateIdForIndex, indexForTemplateId, DEFAULT_TEMPLATE_ID } from "./legacyStyleIndex";

/** Highest legacy index the style tables actually define. */
const MAX_STYLE_INDEX = 15;
/** Sentinel meaning "no captions on this run". Not a style. */
export const CAPTIONS_OFF = -1;

export interface CaptionCreateInput {
  captionStyleIndex?: unknown;
  captionTemplateId?: unknown;
}

export interface CaptionCreateResult {
  /** -1 when captions are off, otherwise a real index 0..15. */
  captionStyleIndex: number;
  /** null when captions are off, otherwise a template slug known to exist. */
  templateId: string | null;
}

/**
 * Resolves the two caption fields against each other.
 *
 * `captionTemplateId` is authoritative when present and valid — it is what the
 * current UI sends. `captionStyleIndex` is the legacy/public-API field and is
 * used only to derive a template when no slug was given, so existing API-key
 * clients keep working unchanged.
 *
 * Anything unrecognised degrades to the default template rather than throwing:
 * a bad style value should not fail a whole render the user has paid to start.
 * The one input that IS honoured exactly is the captions-off sentinel.
 */
export function resolveCaptionCreateInput(body: CaptionCreateInput): CaptionCreateResult {
  const rawIndex = body.captionStyleIndex;
  const index =
    typeof rawIndex === "number" && Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : null;

  // Captions off — asserted by either field. Checked first so an explicit -1
  // is never reinterpreted as a style.
  if (index === CAPTIONS_OFF || body.captionTemplateId === null) {
    return { captionStyleIndex: CAPTIONS_OFF, templateId: null };
  }

  const slug = typeof body.captionTemplateId === "string" ? body.captionTemplateId : null;
  if (slug && CAPTION_TEMPLATES.some((t) => t.id === slug)) {
    return { captionStyleIndex: indexForTemplateId(slug), templateId: slug };
  }

  // No usable slug: fall back to the legacy index, clamped into range.
  if (index !== null && index >= 0) {
    const clamped = Math.min(index, MAX_STYLE_INDEX);
    return { captionStyleIndex: clamped, templateId: templateIdForIndex(clamped) };
  }

  return {
    captionStyleIndex: indexForTemplateId(DEFAULT_TEMPLATE_ID),
    templateId: DEFAULT_TEMPLATE_ID,
  };
}
