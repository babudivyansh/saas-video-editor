// Adapts the existing 16 CAPTION_STYLES (lib/caption-styles.ts — already used
// by the Auto Clip pipeline's style picker, base+highlight colors proven for
// real subtitle burn-ins) into the editor's own CaptionClip style shape,
// rather than inventing a parallel preset system.

import { CAPTION_STYLES } from "@/lib/caption-styles";
import type { CaptionClip } from "@/lib/editor/types";

export interface CaptionTemplate {
  label: string;
  preview: string;
  styleOnly: Partial<CaptionClip>;
}

const FROM_CAPTION_STYLES: CaptionTemplate[] = CAPTION_STYLES.map((s) => ({
  label: s.label,
  preview: s.uppercase ? s.label.toUpperCase() : s.label,
  styleOnly: {
    fontFamily: s.fontFamily.startsWith("Impact") ? "Impact" : s.fontFamily.startsWith("'Times") ? "Times New Roman" : "Arial",
    color: s.color,
    highlightColor: s.highlight,
    highlightMode: "karaoke",
    bold: s.weight >= 700,
    textTransform: s.uppercase ? "uppercase" : "none",
  },
}));

// The 6 richer AutoClip looks (lib/caption-templates.ts), translated into
// CaptionClip's own fields rather than ported as-is: AutoClip's templates are
// ASS-based (a `SubtitleStyle`, animated:boolean, hex colors as &HBBGGRR) and
// the editor's CaptionClip has no such type — it has its own, more capable
// vocabulary (highlightMode "word"/"phrase"/"karaoke", real strokeColor/
// strokeWidthPct/shadow, all exported via caption-ass.ts) that already covers
// everything these looks need. `animated: true` maps to `highlightMode:
// "karaoke"` — CaptionClip.entrance/loop/exit exist too, but per their own
// doc comment they're PREVIEW-ONLY (filtergraph.ts never applies them), so
// using them here would look animated in the editor and ship static in the
// actual export. Colors are the exact hex AutoClip's own ASS-to-hex
// conversion (auto-clip/page.tsx's assToHex) produces for each named ASS
// constant, for pixel-parity with what AutoClip already renders.
//
// Deliberately NOT ported here: AutoClip templates' emoji auto-placement
// (`planEmoji`/`EMOJI_MAP`, also in lib/caption-templates.ts). That mutates
// cue text/words, not just style, which is a different, more invasive kind of
// feature than this style-only gallery — needs its own design pass for how
// "apply to whole track" should interact with per-cue text edits.
const RICH_LOOKS: CaptionTemplate[] = [
  {
    label: "Clean",
    preview: "Clean",
    styleOnly: {
      fontFamily: "Arial", bold: false, textTransform: "none",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.012,
      highlightMode: "karaoke", highlightColor: "#FACC15",
    },
  },
  {
    label: "Bold Impact",
    preview: "BOLD IMPACT",
    styleOnly: {
      fontFamily: "Impact", bold: true, textTransform: "uppercase",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.016,
      shadow: { color: "#000000", offsetXPct: 0, offsetYPct: 0.006, opacity: 0.6 },
      highlightMode: "karaoke", highlightColor: "#80DE4A",
    },
  },
  {
    label: "Podcast",
    preview: "Podcast",
    styleOnly: {
      fontFamily: "Poppins", bold: false, textTransform: "none",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.006,
      highlightMode: "karaoke", highlightColor: "#22D3EE",
    },
  },
  {
    label: "Minimal",
    preview: "Minimal",
    styleOnly: {
      fontFamily: "Poppins", bold: false, textTransform: "none",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.006,
      highlightMode: "none",
    },
  },
  {
    label: "Neon",
    preview: "Neon",
    styleOnly: {
      fontFamily: "Montserrat", bold: false, textTransform: "none",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.014,
      shadow: { color: "#C4B5D4", offsetXPct: 0, offsetYPct: 0, opacity: 0.5, blurPx: 6 },
      highlightMode: "karaoke", highlightColor: "#C4B5D4",
    },
  },
  {
    label: "Headline",
    preview: "Headline",
    styleOnly: {
      fontFamily: "Playfair Display", bold: false, textTransform: "none",
      color: "#FFFFFF", strokeColor: "#000000", strokeWidthPct: 0.009,
      highlightMode: "karaoke", highlightColor: "#EF4444",
    },
  },
];

export const CAPTION_TEMPLATES: CaptionTemplate[] = [...RICH_LOOKS, ...FROM_CAPTION_STYLES];
