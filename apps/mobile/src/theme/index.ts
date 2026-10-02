import { colors, font, layout, radius, shadow, space } from "@clipiro/shared";

export { colors, font, layout, radius, shadow, space };

/** `#rrggbb` + alpha → `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// The designs layer translucent versions of the base palette on top of each
// other. They are derived here from the shared tokens, so every screen still
// traces back to @clipiro/shared and nothing hard-codes a colour.
const WHITE = "#ffffff";
const BLACK = "#000000";

export const derived = {
  /** Unchecked toggle/checkbox outline. */
  controlBorder: withAlpha(WHITE, 0.22),
  /** Inactive waveform bars and empty slots. */
  track: withAlpha(WHITE, 0.25),
  /** Inner highlight on raised cards. */
  hairline: withAlpha(WHITE, 0.05),
  /** Focus ring around a focused field. */
  focusRing: withAlpha(colors.emeraldBright, 0.18),
  errorRing: withAlpha(colors.error, 0.18),
  /** Text badges laid over imagery. */
  overlay: withAlpha(colors.bg, 0.82),
  /** Behind bottom sheets. */
  scrim: withAlpha(BLACK, 0.6),
  /** Translucent pill over photos (onboarding Skip). */
  glass: withAlpha(colors.bg, 0.55),
  /** Raised-card drop shadow colour. */
  shadow: withAlpha(BLACK, 0.45),
  /** Icon chip laid over a photo card. */
  photoChip: withAlpha(colors.bg, 0.7),
  /** Behind the status bar over scrolled content. */
  statusBar: withAlpha(colors.bg, 0.92),
  /** Skeleton base. */
  skeleton: colors.surface3,
} as const;

/** 12% tint behind a status colour (badges), per the designs. */
export const statusTint = (c: string) => withAlpha(c, 0.12);

export const elevation = {
  // boxShadow (not the deprecated shadow* props) renders on Android with the
  // New Architecture and on web alike. Values = shared `shadow.card`.
  card: {
    boxShadow: `0 ${shadow.card.shadowOffset.height}px ${shadow.card.shadowRadius}px ${withAlpha(BLACK, shadow.card.shadowOpacity)}`,
  },
  tabBar: { boxShadow: `0 12px 32px ${withAlpha(BLACK, 0.6)}` },
} as const;

export { type, text, fontFamily } from "./typography";
export type { Weight } from "./typography";
