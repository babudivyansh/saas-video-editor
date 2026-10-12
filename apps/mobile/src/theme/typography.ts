import type { TextStyle } from "react-native";
import { colors, font } from "@clipiro/shared";

// Android does not synthesise weights for custom fonts — `fontWeight` is
// ignored once `fontFamily` is a loaded file. Every weight therefore maps to
// its own Geist file, and styles must never set fontWeight directly.
export type Weight = keyof typeof font.weight; // regular | medium | semibold | bold | heavy

const SANS: Record<Weight, string> = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  heavy: "Geist_800ExtraBold",
};

const MONO: Record<Weight, string> = {
  regular: "GeistMono_400Regular",
  medium: "GeistMono_500Medium",
  semibold: "GeistMono_600SemiBold",
  bold: "GeistMono_600SemiBold",
  heavy: "GeistMono_600SemiBold",
};

export function fontFamily(weight: Weight = "regular", mono = false): string {
  return (mono ? MONO : SANS)[weight];
}

/** Text style for a size + weight; letterSpacing from the designs' em values. */
export function type(
  size: number,
  weight: Weight = "regular",
  opts: { color?: string; tracking?: number; lineHeight?: number; mono?: boolean } = {},
): TextStyle {
  return {
    fontFamily: fontFamily(weight, opts.mono),
    fontSize: size,
    color: opts.color ?? colors.fg,
    ...(opts.tracking ? { letterSpacing: opts.tracking * size } : null),
    ...(opts.lineHeight ? { lineHeight: Math.round(opts.lineHeight * size) } : null),
  };
}

/** Named styles that recur across the designs. */
export const text = {
  display: type(font.size.display, "heavy", { tracking: -0.03 }),
  h1: type(font.size.h1, "bold", { tracking: -0.03, lineHeight: 1.15 }),
  title: type(font.size.title, "bold", { tracking: -0.03, lineHeight: 1.15 }),
  body: type(font.size.body, "regular", { lineHeight: 1.5 }),
  bodyStrong: type(font.size.body, "semibold"),
  caption: type(font.size.caption, "regular", { color: colors.fgMuted }),
  /** 11px uppercase section/field labels. */
  label: { ...type(font.size.min, "semibold", { color: colors.fgSubtle, tracking: 0.08 }), textTransform: "uppercase" } as TextStyle,
  mono: type(font.size.caption, "medium", { mono: true }),
} as const;
