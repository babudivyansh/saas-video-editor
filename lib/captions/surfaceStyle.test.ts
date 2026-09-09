// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveSurfaceCaptionStyle, readProjectCaptionStyle } from "./surfaceStyle";
import { getCaptionTemplate } from "@/lib/caption-templates";
import { styleIndexToSubtitleStyle } from "@/utils/ffmpeg-render";
import type { WordTiming } from "@/utils/elevenlabs";

const words = [
  { word: "this", start: 0, end: 400 },
  { word: "is", start: 400, end: 600 },
  { word: "money", start: 600, end: 1200 },
] as WordTiming[];

describe("resolveSurfaceCaptionStyle", () => {
  it("renders an old row exactly as it always did when there is no slug", () => {
    // The compatibility guarantee. Every reddit/split-screen project in the
    // database stores only an integer; if this drifts, re-rendering an existing
    // project silently changes its look.
    for (const mode of ["oneword", "lines"] as const) {
      for (const i of [0, 3, 7, 15]) {
        const expected = styleIndexToSubtitleStyle(i, mode);
        const actual = resolveSurfaceCaptionStyle({ styleIndex: i, mode });
        // `lines` additionally pins animated:false — compare the rest.
        expect({ ...actual, animated: undefined }).toEqual({ ...expected, animated: undefined });
      }
    }
  });

  it("lets the template win over the legacy index", () => {
    const style = resolveSurfaceCaptionStyle({ templateId: "hormozi", styleIndex: 2 });
    expect(style.fontName).toBe("Impact");
    expect(style.fontSize).toBe(getCaptionTemplate("hormozi")!.style.fontSize);
    // Index 2 is a serif look; nothing of it may survive.
    expect(style.fontName).not.toBe("Times New Roman");
  });

  it("replaces the base style rather than merging into it", () => {
    // A merge would leave the index's fontSize wherever the template omits one,
    // producing a look that is neither.
    const t = getCaptionTemplate("minimal")!;
    const style = resolveSurfaceCaptionStyle({ templateId: "minimal", styleIndex: 13 });
    expect(style.fontSize).toBe(t.style.fontSize);
    expect(style.baseColor).toBe(t.style.baseColor);
  });

  it("makes 'lines' mode actually group words, for the first time", () => {
    // generateASS branches on `animated`. styleIndexToSubtitleStyle never set
    // it, so both modes always rendered line blocks and the toggle was inert.
    const oneword = resolveSurfaceCaptionStyle({ templateId: "hormozi", mode: "oneword" });
    const lines = resolveSurfaceCaptionStyle({ templateId: "hormozi", mode: "lines" });
    expect(oneword.animated).toBe(true);
    expect(lines.animated).toBe(false);
  });

  it("carries emoji onto these surfaces, from the same planner the renderer uses", () => {
    const style = resolveSurfaceCaptionStyle({ templateId: "hormozi", words });
    expect(style.motion?.emoji).toEqual({ 2: "💰" });
  });

  it("adds no emoji for a template that doesn't ask for them", () => {
    const style = resolveSurfaceCaptionStyle({ templateId: "minimal", words });
    expect(style.motion?.emoji).toBeUndefined();
  });

  it("falls back instead of throwing on an unknown slug", () => {
    const style = resolveSurfaceCaptionStyle({ templateId: "not-a-template", styleIndex: 6 });
    expect(style).toEqual(expect.objectContaining(styleIndexToSubtitleStyle(6, "oneword")));
  });
});

describe("readProjectCaptionStyle", () => {
  it("prefers a stored slug", () => {
    expect(readProjectCaptionStyle({ templateId: "neon", styleIndex: 0, mode: "lines" }))
      .toEqual({ templateId: "neon", mode: "lines" });
  });

  it("derives a slug for rows saved before slugs existed", () => {
    // This is what makes a SQL backfill unnecessary.
    expect(readProjectCaptionStyle({ styleIndex: 7 }).templateId).toBe("hormozi");
    expect(readProjectCaptionStyle({ styleIndex: 2 }).templateId).toBe("news");
  });

  it("refuses to read the OTHER shape stored in the same column", () => {
    // The legacy /editor compile flow writes {fontName, fontSize, ...} into
    // Project.subtitlesStyle. Treating its absent index as 0 would report
    // "Clean" for a style that is nothing of the sort.
    expect(readProjectCaptionStyle({ fontName: "Arial", fontSize: 80 }).templateId).toBeNull();
    expect(readProjectCaptionStyle({}).templateId).toBeNull();
    expect(readProjectCaptionStyle(null).templateId).toBeNull();
  });

  it("treats the captions-off sentinel as no style, not as style 0", () => {
    expect(readProjectCaptionStyle({ styleIndex: -1 }).templateId).toBeNull();
  });

  it("defaults an unrecognised mode to oneword", () => {
    expect(readProjectCaptionStyle({ styleIndex: 0, mode: "nonsense" }).mode).toBe("oneword");
  });
});
