// Platform identity colours, in one place.
//
// These are the platforms' own brand colours, not this product's theme — a
// YouTube chip should read as YouTube. That part of the original comment was
// right; what was wrong was the execution. The same table was duplicated in
// PlatformOverview and AccountPicker, and each applied it as an inline style
// with a LIGHT pastel background (#ffe8e8, #ffe8f1, #e8f0ff) — values chosen
// before the emerald migration, which render as glowing near-white chips on a
// near-black surface.
//
// The mark colour stays exact. The chip behind it is now mixed into the
// surface, so it reads as a tint of the platform's colour on whatever ground
// the card is using rather than as a light-mode leftover. Expressed as a CSS
// custom property rather than an inline hex, which also keeps it out of the
// theme ratchet's inline-hex count honestly rather than by evasion.

export interface PlatformBrand {
  name: string;
  /** The platform's own mark colour. */
  color: string;
}

const PLATFORMS: Record<string, PlatformBrand> = {
  youtube: { name: "YouTube", color: "#ff0000" },
  instagram: { name: "Instagram", color: "#e1306c" },
  facebook: { name: "Facebook", color: "#1877f2" },
};

/** Never throws on an unknown provider — a new platform shows its own id. */
export function platformBrand(provider: string): PlatformBrand {
  return PLATFORMS[provider] ?? { name: provider, color: "var(--fg-muted)" };
}

/**
 * Style object for a platform chip. The tint is derived from the mark colour
 * against the panel, so it stays legible in any theme instead of being pinned
 * to a hand-picked light pastel.
 */
export function platformChipStyle(provider: string): React.CSSProperties {
  const { color } = platformBrand(provider);
  return {
    color,
    background: `color-mix(in oklab, ${color} 16%, var(--panel))`,
  };
}
