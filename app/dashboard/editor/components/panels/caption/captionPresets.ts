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

export const CAPTION_TEMPLATES: CaptionTemplate[] = CAPTION_STYLES.map((s) => ({
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
