// Client-side visual descriptors for the 16 caption styles. These mirror the
// server's styleIndexToSubtitleStyle intent (font + colors) so the live preview
// and the style picker look like the burned-in result.

export interface ClientCaptionStyle {
  label: string;
  fontFamily: string;
  color: string;      // base word color
  highlight: string;  // active word color
  weight: number;
  italic?: boolean;
  uppercase?: boolean;
}

const ARIAL = "Arial, sans-serif";
const IMPACT = "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
const TIMES = "'Times New Roman', Times, serif";

export const CAPTION_STYLES: ClientCaptionStyle[] = [
  { label: "Classic",      fontFamily: ARIAL,  color: "#ffffff", highlight: "#facc15", weight: 800 },
  { label: "Cyan",         fontFamily: ARIAL,  color: "#22d3ee", highlight: "#facc15", weight: 800 },
  { label: "Serif Glow",   fontFamily: TIMES,  color: "#ffffff", highlight: "#ffffff", weight: 700 },
  { label: "Serif Thin",   fontFamily: TIMES,  color: "#ffffff", highlight: "#ffffff", weight: 500 },
  { label: "Italic",       fontFamily: ARIAL,  color: "#ffffff", highlight: "#facc15", weight: 800, italic: true },
  { label: "Caps",         fontFamily: ARIAL,  color: "#ffffff", highlight: "#facc15", weight: 800, uppercase: true },
  { label: "Green",        fontFamily: ARIAL,  color: "#4ade80", highlight: "#4ade80", weight: 800 },
  { label: "Impact Italic",fontFamily: IMPACT, color: "#ffffff", highlight: "#facc15", weight: 700, italic: true },
  { label: "Caps Italic",  fontFamily: ARIAL,  color: "#ffffff", highlight: "#facc15", weight: 800, italic: true, uppercase: true },
  { label: "Red Badge",    fontFamily: ARIAL,  color: "#ffffff", highlight: "#ffffff", weight: 800 },
  { label: "Impact",       fontFamily: IMPACT, color: "#ffffff", highlight: "#facc15", weight: 700 },
  { label: "Light",        fontFamily: ARIAL,  color: "#ffffff", highlight: "#facc15", weight: 600 },
  { label: "Serif Yellow", fontFamily: TIMES,  color: "#facc15", highlight: "#facc15", weight: 700 },
  { label: "Impact Yellow",fontFamily: IMPACT, color: "#facc15", highlight: "#facc15", weight: 700 },
  { label: "Yellow",       fontFamily: ARIAL,  color: "#facc15", highlight: "#facc15", weight: 800 },
  { label: "Blue",         fontFamily: ARIAL,  color: "#3b82f6", highlight: "#3b82f6", weight: 800 },
];
