// Premium dark design tokens for the advanced editor. Centralizing these keeps
// every panel consistent and makes future theming a one-file change.
export const T = {
  // Surfaces (darkest → lightest)
  bg: "#0B0C0F",        // app canvas behind panels
  surface: "#121318",   // panels
  surface2: "#171922",  // raised cards / inputs
  surface3: "#1E212B",  // hover / active
  // Lines
  border: "#23262F",
  borderStrong: "#2D313C",
  // Text
  text: "#E8EAF0",
  textMuted: "#9AA0AD",
  textFaint: "#5B6170",
  // Brand accent
  accent: "#335CFF",
  accentHover: "#284BE0",
  accentSoft: "rgba(51,92,255,0.14)",
  accentRing: "rgba(51,92,255,0.45)",
  // Status
  green: "#3DD68C",
  amber: "#F5B544",
  red: "#FF5C5C",
  // Effects
  glass: "rgba(18,19,24,0.72)",
  shadow: "0 12px 40px rgba(0,0,0,0.45)",
} as const;

export type EditorTheme = typeof T;
