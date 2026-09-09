// The editor's caption gallery, generated from the one caption-template
// library (lib/caption-templates.ts) instead of hand-copied from it.
//
// This file used to hold two parallel preset systems: RICH_LOOKS, a
// hand-transcribed copy of six templates whose hex colours had been run
// through assToHex BY HAND, and FROM_CAPTION_STYLES, derived from the retired
// 16-entry lib/caption-styles.ts table. The first is exactly the drift the
// templates file exists to prevent — a colour corrected there stayed wrong
// here — and the second described looks no other surface offers any more.
//
// Both are gone. The gallery is now `CAPTION_TEMPLATES.map(...)` through the
// conversion below, so the editor names a style the same as AutoClip and the
// create flows do, and a change to a template reaches all four.
//
// What is deliberately NOT ported, both for reasons that still hold:
//
//   entrance / loop / exit — CaptionClip has them, but per their own doc
//   comment they are PREVIEW-ONLY: lib/editor/filtergraph.ts never applies
//   them, so a template's `animated: true` mapped onto an entrance animation
//   would look animated in the editor and ship static. It maps to
//   highlightMode "karaoke" instead, which does survive the export.
//
//   emoji / keywordColor — planEmoji mutates cue TEXT, and cue text here is
//   user-edited data (CaptionListSection lets people rewrite, delete, hide and
//   retime every cue). A style gallery must not rewrite what the captions say.
//   keywordColor additionally needs the LLM emphasis indices that the editor
//   document does not carry.

import { CAPTION_TEMPLATES as CAPTION_TEMPLATE_LIBRARY, type CaptionTemplate as LibraryTemplate } from "@/lib/caption-templates";
import { assToHex } from "@/lib/ass-color";
import type { CaptionClip, FontFamily } from "@/lib/editor/types";

export interface CaptionTemplate {
  /** Template slug. Keys the gallery — labels are display strings and an admin
   *  Config override can introduce a duplicate one. */
  id: string;
  label: string;
  preview: string;
  styleOnly: Partial<CaptionClip>;
}

/**
 * ASS font name → a family the editor can actually render.
 *
 * `satisfies` is load-bearing: FONT_WHITELIST has no "Outfit", which three
 * templates use, so an unmapped font would silently become a runtime fallback
 * in the export. Adding a template with a new font is a compile error here
 * until it is mapped.
 */
const FONT_MAP = {
  Outfit: "Poppins",
  Impact: "Impact",
  Poppins: "Poppins",
  Montserrat: "Montserrat",
  Anton: "Anton",
  "Bebas Neue": "Bebas Neue",
  Oswald: "Oswald",
  "Playfair Display": "Playfair Display",
  Arial: "Arial",
  "Times New Roman": "Times New Roman",
} satisfies Record<string, FontFamily>;

/** Fonts that ARE the all-caps look; the ASS side gets that from the face itself. */
const UPPERCASE_FONTS = new Set(["Impact", "Anton", "Bebas Neue"]);

/** The frame height the ASS styles are authored against (PlayResY). */
const ASS_FRAME_HEIGHT = 1920;

export function captionTemplateToClipStyle(t: LibraryTemplate): Partial<CaptionClip> {
  const s = t.style;
  const font = (FONT_MAP as Record<string, FontFamily>)[s.fontName ?? "Outfit"] ?? "Arial";
  const base = assToHex(s.baseColor ?? "&H00FFFFFF");
  const highlight = s.highlightColor ? assToHex(s.highlightColor) : null;

  // A template whose highlight equals its base is not highlighting anything —
  // saying "karaoke" there would animate a colour sweep between two identical
  // colours, which reads as a bug rather than a style.
  const highlightMode: CaptionClip["highlightMode"] =
    !highlight || highlight === base ? "none" : s.animated === false ? "word" : "karaoke";

  const style: Partial<CaptionClip> = {
    fontFamily: font,
    bold: UPPERCASE_FONTS.has(s.fontName ?? ""),
    textTransform: UPPERCASE_FONTS.has(s.fontName ?? "") ? "uppercase" : "none",
    color: base,
    strokeColor: assToHex(s.outlineColor ?? "&H00000000"),
    // ASS outline widths are pixels at PlayResY; CaptionClip wants a fraction
    // of frame height, which is what makes the look survive a resize.
    strokeWidthPct: (s.outlineWidth ?? 4) / ASS_FRAME_HEIGHT,
    highlightMode,
    positionPreset: s.alignment === 2 ? "bottom" : s.alignment === 8 ? "top" : "center",
  };

  if (highlightMode !== "none" && highlight) style.highlightColor = highlight;
  if (s.shadowDepth) {
    style.shadow = {
      color: "#000000",
      offsetXPct: 0,
      offsetYPct: s.shadowDepth / ASS_FRAME_HEIGHT,
      opacity: 0.6,
    };
  }
  return style;
}

export const CAPTION_TEMPLATES: CaptionTemplate[] = CAPTION_TEMPLATE_LIBRARY.map((t) => ({
  id: t.id,
  label: t.label,
  preview: UPPERCASE_FONTS.has(t.style.fontName ?? "") ? t.label.toUpperCase() : t.label,
  styleOnly: captionTemplateToClipStyle(t),
}));
