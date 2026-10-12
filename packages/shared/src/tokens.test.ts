import { describe, expect, it } from "vitest";
import { colors } from "./tokens";

// WCAG 2.1 contrast for the app's text colours on the surfaces they sit on
// (mobile Phase 14). AA needs 4.5:1 for body text; the app's smallest text is
// 11 px, so everything is held to 4.5, not the 3:1 large-text allowance.

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const SURFACES = { bg: colors.bg, bgDeep: colors.bgDeep, surface1: colors.surface1, surface2: colors.surface2, surface3: colors.surface3 };
const TEXT = {
  fg: colors.fg,
  fgMuted: colors.fgMuted,
  fgSubtle: colors.fgSubtle,
  emeraldBright: colors.emeraldBright,
  primary: colors.primary,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.info,
};

describe("colour contrast (WCAG AA, 4.5:1)", () => {
  for (const [t, fg] of Object.entries(TEXT)) {
    for (const [s, bg] of Object.entries(SURFACES)) {
      it(`${t} on ${s}`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
    }
  }

  it("text on the filled buttons", () => {
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5); // primary Button
    expect(contrast(colors.bg, colors.emeraldBright)).toBeGreaterThanOrEqual(4.5); // card actions, selected day
    expect(contrast(colors.bg, colors.emerald)).toBeGreaterThanOrEqual(4.5); // Clipiro AI avatar icon
  });
});
