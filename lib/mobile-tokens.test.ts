import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colors, radius } from "@clipiro/shared";

// The Android app styles itself from @clipiro/shared's tokens; the web app
// from the `.theme-emerald` block in globals.css. They are two copies of one
// palette, so this fails the moment either side changes without the other.

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const emeraldBlock = css.slice(css.indexOf(".theme-emerald {"));

function cssVar(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not found in globals.css`);
  return m[1].trim();
}

// "rgba(255, 255, 255, 0.08)" and "rgba(255,255,255,0.08)" are the same colour.
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");

// token key -> CSS custom property in .theme-emerald
const COLOR_VARS: Record<string, string> = {
  bg: "bg",
  bgDeep: "bg-deep",
  surface1: "surface-1",
  surface2: "surface-2",
  surface3: "surface-3",
  panel: "panel",
  panelRaised: "panel-raised",
  fg: "fg",
  fgMuted: "fg-muted",
  fgSubtle: "fg-subtle",
  line: "line",
  lineStrong: "line-strong",
  primary: "primary",
  primaryHover: "primary-hover",
  primaryPress: "primary-press",
  onPrimary: "on-primary",
  emerald: "emerald-brand",
  emeraldBright: "emerald-bright",
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
};

describe("@clipiro/shared tokens match the web's emerald theme", () => {
  it.each(Object.entries(COLOR_VARS))("colors.%s === --%s", (key, cssName) => {
    expect(norm(colors[key as keyof typeof colors])).toBe(norm(cssVar(emeraldBlock, cssName)));
  });

  it("every colour token is either mapped above or a mobile-only tint", () => {
    // tint/tintBorder have no CSS equivalent (the web mixes tints with
    // color-mix); they are the emerald-bright rgb at 10% / 28% alpha.
    const mobileOnly = ["tint", "tintBorder"];
    expect(Object.keys(colors).filter((k) => !(k in COLOR_VARS) && !mobileOnly.includes(k))).toEqual([]);
  });

  it("tints are emerald-bright at 10% and 28%", () => {
    expect(colors.emeraldBright).toBe("#20d68a"); // = rgb(32, 214, 138)
    expect(norm(colors.tint)).toBe("rgba(32,214,138,0.10)");
    expect(norm(colors.tintBorder)).toBe("rgba(32,214,138,0.28)");
  });

  it("field and card radii match", () => {
    expect(`${radius.field}px`).toBe(cssVar(css, "radius-field"));
    expect(`${radius.card}px`).toBe(cssVar(css, "radius-card"));
  });
});
