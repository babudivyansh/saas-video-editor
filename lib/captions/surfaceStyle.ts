// Caption style resolution for the non-AutoClip video products.
//
// reddit-video, split-screen (both the split-video and viral-split-screen
// pages) and streamer-video each picked a caption look by ARRAY INDEX, from
// four verbatim copies of the same 16-entry CSS table. AutoClip moved to named
// templates (lib/caption-templates.ts) selected by slug; this is what lets the
// other surfaces do the same without each one re-deriving the rules.
//
// It is deliberately the SAME sequence lib/autoclip-pipeline.ts already applies
// when it renders a clip — base style, then template, then motion — extracted
// rather than reinvented, so a template cannot look one way on AutoClip and
// another way on split-screen.

import { getCaptionTemplate } from "@/lib/caption-templates";
import { captionMotion } from "@/lib/caption-motion";
import { templateIdForIndex } from "./legacyStyleIndex";
import { styleIndexToSubtitleStyle, type SubtitleStyle } from "@/utils/ffmpeg-render";
import type { WordTiming } from "@/utils/elevenlabs";

export type CaptionLayoutMode = "oneword" | "lines";

export interface SurfaceStyleInput {
  /** Template slug. Authoritative when it resolves. */
  templateId?: string | null;
  /** Legacy integer index. Used only as the base, and for rows with no slug. */
  styleIndex?: number | null;
  mode?: CaptionLayoutMode;
  /** Word timings, when the surface has them — only used to plan emoji. */
  words?: WordTiming[];
}

/**
 * The ASS style a non-AutoClip surface should burn in.
 *
 * Order matters:
 *
 *  1. The legacy index is the BASE, so a row saved before templates existed
 *     renders byte-identically to how it always did.
 *  2. A resolved template REPLACES that base rather than merging into it. Its
 *     `style` is complete, and spreading it over the index style would leave
 *     the index's fontSize/font behind wherever the template omits one —
 *     producing a look that is neither.
 *  3. `mode: "lines"` forces `animated: false`. That is not a shortcut: it is
 *     precisely what generateASS branches on (utils/ffmpeg-render.ts) to group
 *     words into lines instead of animating them one at a time. Until now the
 *     One Word / Lines toggle on these three pages changed only which colour
 *     table was read — `styleIndexToSubtitleStyle` never set `animated` in
 *     either mode, so every render was a 5-word line block regardless. This is
 *     the line that makes that toggle mean what it says.
 *  4. Motion last, so emoji and keyword colour ride on top of whichever style
 *     won. These surfaces have no energy track, and captionMotion handles a
 *     null signal by returning emoji/keyword-colour only.
 */
export function resolveSurfaceCaptionStyle(input: SurfaceStyleInput): SubtitleStyle {
  const mode = input.mode ?? "oneword";
  let style = styleIndexToSubtitleStyle(input.styleIndex ?? 0, mode);

  const template = getCaptionTemplate(input.templateId);
  if (template) style = { ...template.style };

  if (mode === "lines") style = { ...style, animated: false };

  const motion = captionMotion(input.words ?? [], template, null);
  if (motion) style = { ...style, motion };

  return style;
}

// ── Project.subtitlesStyle ──────────────────────────────────────────────────
//
// One Json column, two unrelated shapes. These products write
// `{ styleIndex, mode }` (and now `templateId`); the legacy /editor compile
// flow writes `{ fontName, fontSize, highlightColor, baseColor }` into the same
// column. Nothing reads either one at render time — the workers read their
// enqueue payload — so this exists for the UI and for analytics, and it has to
// be able to say "that isn't mine" rather than guess.

export interface StoredCaptionStyle {
  /** null when the row is captions-off, unrecognised, or the other shape. */
  templateId: string | null;
  mode: CaptionLayoutMode;
}

/**
 * Reads a stored caption style, deriving a template slug for rows saved before
 * slugs existed. Returns templateId null — never a wrong style — when the
 * value is the editor's shape, the captions-off sentinel, or absent.
 *
 * This is why no SQL backfill is needed: an old row resolves through the same
 * INDEX_TO_TEMPLATE map a migration would have used, lazily and reversibly.
 */
export function readProjectCaptionStyle(value: unknown): StoredCaptionStyle {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const mode: CaptionLayoutMode = obj.mode === "lines" ? "lines" : "oneword";

  if (typeof obj.templateId === "string" && getCaptionTemplate(obj.templateId)) {
    return { templateId: obj.templateId, mode };
  }

  // The /editor compile shape carries fontName and no styleIndex. Reading its
  // absent index as 0 would report "Clean" for a style that is nothing of the
  // sort.
  if (typeof obj.styleIndex !== "number") return { templateId: null, mode };

  return { templateId: templateIdForIndex(obj.styleIndex), mode };
}
