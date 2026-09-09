// The 6 richer AutoClip-derived looks (RICH_LOOKS in captionPresets.ts) are
// hand-written style literals, not generated — a typo'd value (strokeWidthPct
// out of its 0..0.05 range, an invalid shadow) would pass TypeScript (they're
// all optional, loosely-typed numbers) but make validateDoc reject any real
// document that uses the template. This is the check that would have caught
// that class of mistake.

import { describe, expect, it } from "vitest";
import { CAPTION_TEMPLATES, captionTemplateToClipStyle } from "./captionPresets";
import { CAPTION_TEMPLATES as LIBRARY, getCaptionTemplate } from "@/lib/caption-templates";
import { FONT_WHITELIST } from "@/lib/editor/types";
import { assToHex, hexToASS } from "@/lib/ass-color";
import { wordsToCaptionCues, type RawWordTiming } from "@/lib/editor/caption-generation";
import { validateDoc, normalizeDoc, type TimelineDoc, type VideoClip } from "@/lib/editor/types";

function videoClip(over: Partial<VideoClip> & { id: string }): VideoClip {
  return { type: "video", assetId: "asset-1", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false, ...over };
}

function words(count: number): RawWordTiming[] {
  return Array.from({ length: count }, (_, i) => ({ word: `w${i}`, start: i * 1000, end: i * 1000 + 900 }));
}

describe("CAPTION_TEMPLATES — every styleOnly produces a valid document", () => {
  const clip = videoClip({ id: "v1" });

  it.each(CAPTION_TEMPLATES.map((t) => [t.label, t.styleOnly] as const))("%s", (_label, styleOnly) => {
    const cues = wordsToCaptionCues(words(4), clip, styleOnly);
    const doc: TimelineDoc = normalizeDoc({
      version: 1, aspect: "9:16", fps: 30,
      tracks: { video: [clip], text: [], audio: [], image: [], caption: cues },
    } as unknown as TimelineDoc);
    expect(validateDoc(doc)).toBeNull();
  });
});

describe("captionTemplateToClipStyle", () => {
  it("covers the whole library, not a hand-picked subset", () => {
    // RICH_LOOKS transcribed six of them; the other 45 were unreachable here.
    expect(CAPTION_TEMPLATES).toHaveLength(LIBRARY.length);
  });

  it("only ever produces a font the editor can render", () => {
    // FONT_WHITELIST has no "Outfit", which three templates use. An unmapped
    // font would fall back silently at export time.
    for (const t of CAPTION_TEMPLATES) {
      expect(FONT_WHITELIST, t.label).toContain(t.styleOnly.fontFamily);
    }
  });

  it("converts ASS colours rather than restating them by hand", () => {
    // The hand-written table had each hex typed out after a manual assToHex.
    // This is the guard on the byte order that file's comments warn about
    // twice: ASS is &HBBGGRR, not &HRRGGBB.
    const clean = getCaptionTemplate("clean")!;
    const style = captionTemplateToClipStyle(clean);
    expect(style.color?.toLowerCase()).toBe("#ffffff");
    expect(style.highlightColor).toBe(assToHex(clean.style.highlightColor!));
    expect(hexToASS(style.highlightColor!).toUpperCase()).toBe(clean.style.highlightColor!.toUpperCase());
  });

  it("does not claim to highlight when the highlight equals the base colour", () => {
    // "minimal" is white-on-white: a karaoke sweep between two identical
    // colours reads as a broken animation, not a style.
    expect(captionTemplateToClipStyle(getCaptionTemplate("minimal")!).highlightMode).toBe("none");
    expect(captionTemplateToClipStyle(getCaptionTemplate("clean")!).highlightMode).toBe("karaoke");
  });

  it("maps a non-animated template to a hard per-word switch, not karaoke", () => {
    expect(captionTemplateToClipStyle(getCaptionTemplate("professional-01")!).highlightMode).toBe("word");
  });

  it("carries the template's frame placement across", () => {
    expect(captionTemplateToClipStyle(getCaptionTemplate("podcast")!).positionPreset).toBe("bottom");
    expect(captionTemplateToClipStyle(getCaptionTemplate("hormozi")!).positionPreset).toBe("center");
  });

  it("expresses the outline as a fraction of frame height, so it survives a resize", () => {
    const t = getCaptionTemplate("hormozi")!;
    expect(captionTemplateToClipStyle(t).strokeWidthPct).toBeCloseTo(t.style.outlineWidth! / 1920, 6);
  });

  it("ports no preview-only animation and no emoji", () => {
    // entrance/loop/exit are never applied by filtergraph.ts, so a template
    // using them would animate in the editor and ship static. Emoji mutate cue
    // TEXT, which is user-edited data here.
    for (const t of CAPTION_TEMPLATES) {
      const s = t.styleOnly as Record<string, unknown>;
      expect(s.entrance, t.label).toBeUndefined();
      expect(s.loop, t.label).toBeUndefined();
      expect(s.exit, t.label).toBeUndefined();
      expect(s.text, t.label).toBeUndefined();
    }
  });
});
