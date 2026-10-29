// Caption customisation on top of a template: a style for single words, and
// one override for the whole project's look.
//
// Pure data and pure functions, like templates.ts, because the browser preview
// (CaptionTemplateRender), the export (lib/captions/engine) and the phone all
// have to agree. Every override resolves to an ordinary CaptionTemplateSpec,
// so the engine itself never learns that a template was customised.

import {
  CAPTION_MOTIONS,
  CAPTION_TEMPLATES,
  resolveCaptionTemplate,
  type CaptionMotionId,
  type CaptionTemplateSpec,
} from "./templates";
import { EMOJI_SET } from "./emoji";

/** How a single word stands out, on top of the template's own motion. */
export type WordEmphasis = "bigger" | "shake" | "box";
export const WORD_EMPHASES: readonly WordEmphasis[] = ["bigger", "shake", "box"];

/** One word's own look. Every field is optional; an empty style is no style. */
export interface CaptionWordStyle {
  /** Fill colour, #rrggbb. The word keeps it whether spoken or not. */
  color?: string;
  emphasis?: WordEmphasis;
  /** One of EMOJI_SET (each has a PNG the export can draw). */
  emoji?: string;
}

/** "bigger" scales the word's em by this much, in both renderers. */
export const BIGGER_SCALE = 1.25;

/** The project-wide look, applied over the chosen template. */
export interface CaptionStyleOverride {
  /** A font some template already uses, so the export has the file. */
  font?: string;
  weight?: number;
  case?: "upper" | "lower" | "none";
  /** Size multiplier over the template's own (0.5..2). */
  size?: number;
  base?: string;
  accent?: string;
  /** null removes the outline. */
  outline?: string | null;
  /** 0..4, the template's outline scale. */
  outlineWidth?: number;
  /** Words on screen at once (1..8). */
  words?: number;
  /** Block centre, % of frame height (5..95). Wins over the template's placement. */
  positionY?: number;
  motion?: CaptionMotionId;
}

/** Fonts the override may pick: the ones the template library already bundles. */
export const CAPTION_STYLE_FONTS: readonly string[] = [...new Set(CAPTION_TEMPLATES.map((t) => t.type.font))].sort();

const HEX = /^#[0-9a-fA-F]{6}$/;
const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

/** null when valid, else what's wrong. */
export function validateWordStyle(style: unknown): string | null {
  if (style === undefined) return null;
  if (!style || typeof style !== "object" || Array.isArray(style)) return "invalid word style";
  const s = style as Record<string, unknown>;
  for (const k of Object.keys(s)) if (!["color", "emphasis", "emoji"].includes(k)) return `unknown word style field ${k}`;
  if (s.color !== undefined && (typeof s.color !== "string" || !HEX.test(s.color))) return "invalid word color";
  if (s.emphasis !== undefined && !WORD_EMPHASES.includes(s.emphasis as WordEmphasis)) return "invalid word emphasis";
  if (s.emoji !== undefined && (typeof s.emoji !== "string" || !EMOJI_SET.includes(s.emoji))) return "invalid word emoji";
  return null;
}

/** null when valid, else what's wrong. */
export function validateCaptionStyle(override: unknown): string | null {
  if (override === undefined) return null;
  if (!override || typeof override !== "object" || Array.isArray(override)) return "invalid caption style";
  const o = override as Record<string, unknown>;
  const known = ["font", "weight", "case", "size", "base", "accent", "outline", "outlineWidth", "words", "positionY", "motion"];
  for (const k of Object.keys(o)) if (!known.includes(k)) return `unknown caption style field ${k}`;
  if (o.font !== undefined && !CAPTION_STYLE_FONTS.includes(o.font as string)) return "caption style font not allowed";
  if (o.weight !== undefined && !(inRange(o.weight, 100, 900) && Number.isInteger(o.weight))) return "invalid caption style weight";
  if (o.case !== undefined && !["upper", "lower", "none"].includes(o.case as string)) return "invalid caption style case";
  if (o.size !== undefined && !inRange(o.size, 0.5, 2)) return "invalid caption style size";
  for (const k of ["base", "accent"] as const) {
    if (o[k] !== undefined && (typeof o[k] !== "string" || !HEX.test(o[k] as string))) return `invalid caption style ${k}`;
  }
  if (o.outline !== undefined && o.outline !== null && (typeof o.outline !== "string" || !HEX.test(o.outline))) return "invalid caption style outline";
  if (o.outlineWidth !== undefined && !inRange(o.outlineWidth, 0, 4)) return "invalid caption style outlineWidth";
  if (o.words !== undefined && !(inRange(o.words, 1, 8) && Number.isInteger(o.words))) return "invalid caption style words";
  if (o.positionY !== undefined && !inRange(o.positionY, 5, 95)) return "invalid caption style positionY";
  if (o.motion !== undefined && !CAPTION_MOTIONS.includes(o.motion as CaptionMotionId)) return "invalid caption style motion";
  return null;
}

/** The template with the override applied. Fields the override leaves out keep the template's value. */
export function applyCaptionStyle(spec: CaptionTemplateSpec, o: CaptionStyleOverride | null | undefined): CaptionTemplateSpec {
  if (!o) return spec;
  const colors = { ...spec.colors };
  if (o.base) colors.base = o.base;
  if (o.accent) colors.accent = o.accent;
  if (o.outline === null) {
    delete colors.outline;
    colors.outlineWidth = 0;
  } else if (o.outline) {
    colors.outline = o.outline;
    if (o.outlineWidth === undefined && !colors.outlineWidth) colors.outlineWidth = 2;
  }
  if (o.outlineWidth !== undefined && o.outline !== null) colors.outlineWidth = o.outlineWidth;
  return {
    ...spec,
    type: {
      ...spec.type,
      ...(o.font ? { font: o.font } : {}),
      ...(o.weight ? { weight: o.weight } : {}),
      ...(o.case ? { case: o.case } : {}),
      ...(o.size ? { size: spec.type.size * o.size } : {}),
    },
    words: o.words ?? spec.words,
    motion: o.motion ?? spec.motion,
    colors,
  };
}

/**
 * A template fitted to the frame it's drawn on. Templates are designed for
 * 9:16; on a wide frame a 1-3 word chunk leaves most of the line empty and a
 * centred block covers the subject, so landscape gets two more words and low
 * placement. Square and 4:5 keep the template as designed.
 */
export function adaptTemplateToFrame(spec: CaptionTemplateSpec, frame: { w: number; h: number }): CaptionTemplateSpec {
  if (frame.w / frame.h < 1.2) return spec;
  return {
    ...spec,
    words: spec.words <= 4 ? Math.min(6, spec.words + 2) : spec.words,
    placement: { ...spec.placement, y: "low" },
  };
}

/**
 * Everything both renderers need to draw a template group: the spec after
 * frame fitting and the user's override (the override wins), and the block
 * position the override asks for, if any.
 */
export function effectiveCaptionTemplate(
  templateId: string,
  override: CaptionStyleOverride | null | undefined,
  frame: { w: number; h: number },
): { template: CaptionTemplateSpec; positionY: number | null } {
  const template = applyCaptionStyle(adaptTemplateToFrame(resolveCaptionTemplate(templateId), frame), override);
  return { template, positionY: override?.positionY ?? null };
}
