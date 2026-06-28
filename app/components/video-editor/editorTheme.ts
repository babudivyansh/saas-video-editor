// Premium LIGHT design tokens for the advanced editor. Centralizing these keeps
// every panel consistent and makes future theming a one-file change.
export const T = {
  // Surfaces (app canvas → raised)
  bg: "#F3F4F7",        // app canvas behind panels
  surface: "#FFFFFF",   // panels
  surface2: "#F6F7F9",  // raised cards / inputs
  surface3: "#ECEEF2",  // hover / active
  // Lines
  border: "#E4E7EC",
  borderStrong: "#D3D8E0",
  // Text
  text: "#15181F",
  textMuted: "#5A6170",
  textFaint: "#98A0AE",
  // Brand accent
  accent: "#335CFF",
  accentHover: "#284BE0",
  accentSoft: "rgba(51,92,255,0.10)",
  accentRing: "rgba(51,92,255,0.35)",
  // Status
  green: "#15A66B",
  amber: "#D6920A",
  red: "#E5484D",
  // Effects
  glass: "rgba(255,255,255,0.82)",
  shadow: "0 12px 40px rgba(16,24,40,0.12)",
} as const;

export type EditorTheme = typeof T;
