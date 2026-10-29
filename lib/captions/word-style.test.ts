// @vitest-environment node
// Caption customisation: one word's own look, and the project-wide override,
// as the export engine draws them (the preview mirrors these rules).
import { describe, expect, it } from "vitest";
import { CAPTION_TEMPLATES, resolveCaptionTemplate } from "@clipiro/shared/caption-templates";
import {
  BIGGER_SCALE,
  CAPTION_STYLE_FONTS,
  adaptTemplateToFrame,
  applyCaptionStyle,
  effectiveCaptionTemplate,
  validateCaptionStyle,
  validateWordStyle,
} from "@clipiro/shared/caption-style";
import { templateCaptionGroups } from "@clipiro/shared/captions";
import { validateDoc, type CaptionClip, type TimelineDoc } from "@/lib/editor/types";
import { buildCaptionTrack } from "@/lib/captions/engine";
import type { EngineWord } from "@/lib/captions/engine";

const W = 1080;
const H = 1920;

// A plain word-by-word template: soft pop, no container, no emoji.
const POP = resolveCaptionTemplate("clean");

function words(styles: EngineWord["style"][] = []): EngineWord[] {
  return ["I", "almost", "quit", "today"].map((word, i) => ({ word, start: 200 + i * 400, end: 550 + i * 400, ...(styles[i] ? { style: styles[i] } : {}) }));
}

/** ASS \1c for #RRGGBB. */
const assFill = (hex: string) => `\\1c&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase().replace("\\1C", "\\1c");

const dialogues = (ass: string) => ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
const textOf = (line: string) => line.slice(line.lastIndexOf("}") + 1);

describe("word style validation", () => {
  it("accepts the three fields and nothing else", () => {
    expect(validateWordStyle(undefined)).toBeNull();
    expect(validateWordStyle({ color: "#FF0000", emphasis: "box", emoji: "🔥" })).toBeNull();
    expect(validateWordStyle({ color: "red" })).toBe("invalid word color");
    expect(validateWordStyle({ emphasis: "spin" })).toBe("invalid word emphasis");
    expect(validateWordStyle({ emoji: "🦄" })).toBe("invalid word emoji");
    expect(validateWordStyle({ font: "x" })).toBe("unknown word style field font");
  });

  it("is enforced by validateDoc on caption words", () => {
    const cue = {
      type: "caption", id: "c1", timelineStart: 0, duration: 2, text: "hi there", templateId: POP.id,
      words: [{ word: "hi", startMs: 0, endMs: 500, style: { color: "#00FF00" } }, { word: "there", startMs: 500, endMs: 900, style: { emoji: "🦄" } }],
      fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, bgColor: null, x: 0.5, y: 0.85, highlightMode: "none",
    } as unknown as CaptionClip;
    const doc: TimelineDoc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: [], image: [], caption: [cue] } };
    expect(validateDoc(doc)).toBe("caption clip invalid word emoji");
    cue.words![1]!.style = { emoji: "🔥" };
    expect(validateDoc(doc)).toBeNull();
  });
});

describe("caption style override", () => {
  it("validates every field", () => {
    expect(validateCaptionStyle(undefined)).toBeNull();
    expect(validateCaptionStyle({ font: CAPTION_STYLE_FONTS[0], weight: 700, case: "upper", size: 1.2, base: "#FFFFFF", accent: "#C8FF55", outline: null, outlineWidth: 2, words: 3, positionY: 70, motion: "pop" })).toBeNull();
    expect(validateCaptionStyle({ font: "Comic Sans MS" })).toBe("caption style font not allowed");
    expect(validateCaptionStyle({ size: 3 })).toBe("invalid caption style size");
    expect(validateCaptionStyle({ words: 2.5 })).toBe("invalid caption style words");
    expect(validateCaptionStyle({ positionY: 100 })).toBe("invalid caption style positionY");
    expect(validateCaptionStyle({ motion: "spin" })).toBe("invalid caption style motion");
    expect(validateCaptionStyle({ colour: "#FFFFFF" })).toBe("unknown caption style field colour");
    const doc: TimelineDoc = { version: 1, aspect: "9:16", fps: 30, captionStyle: { size: 9 }, tracks: { video: [], text: [], audio: [], image: [], caption: [] } };
    expect(validateDoc(doc)).toBe("invalid caption style size");
  });

  it("applies over the template and leaves the rest alone", () => {
    const t = applyCaptionStyle(POP, { accent: "#123456", size: 1.5, words: 5, outline: null, case: "lower" });
    expect(t.colors.accent).toBe("#123456");
    expect(t.colors.base).toBe(POP.colors.base);
    expect(t.colors.outline).toBeUndefined();
    expect(t.colors.outlineWidth).toBe(0);
    expect(t.type.size).toBeCloseTo(POP.type.size * 1.5);
    expect(t.type.case).toBe("lower");
    expect(t.type.font).toBe(POP.type.font);
    expect(t.words).toBe(5);
    expect(t.motion).toBe(POP.motion);
    expect(applyCaptionStyle(POP, undefined)).toBe(POP);
  });

  it("fits a template to a landscape frame, and leaves tall and square frames as designed", () => {
    const wide = adaptTemplateToFrame(POP, { w: 1920, h: 1080 });
    expect(wide.words).toBe(Math.min(6, POP.words + 2));
    expect(wide.placement.y).toBe("low");
    expect(adaptTemplateToFrame(POP, { w: 1080, h: 1920 })).toBe(POP);
    expect(adaptTemplateToFrame(POP, { w: 1080, h: 1080 })).toBe(POP);
    expect(adaptTemplateToFrame(POP, { w: 1080, h: 1350 })).toBe(POP);
  });

  it("lets the user's word count and position win over the frame fit", () => {
    const { template, positionY } = effectiveCaptionTemplate(POP.id, { words: 2, positionY: 30 }, { w: 1920, h: 1080 });
    expect(template.words).toBe(2);
    expect(positionY).toBe(30);
    expect(effectiveCaptionTemplate("not-a-template", null, { w: W, h: H }).template.id).toBe(resolveCaptionTemplate(null).id);
  });
});

describe("the engine draws a word's own style", () => {
  it("keeps a coloured word its colour, spoken or not", () => {
    const track = buildCaptionTrack({ words: words([undefined, undefined, { color: "#FF00AA" }]), template: POP, W, H });
    const quit = dialogues(track.ass).filter((l) => textOf(l) === POP_CASE("quit"));
    expect(quit.length).toBeGreaterThan(1);
    for (const l of quit) expect(l).toContain(assFill("#FF00AA"));
    const almost = dialogues(track.ass).filter((l) => textOf(l) === POP_CASE("almost"));
    expect(almost.some((l) => l.includes(assFill(POP.colors.base)))).toBe(true);
  });

  it("puts a boxed word on its own box with dark, unstroked text", () => {
    const track = buildCaptionTrack({ words: words([undefined, { emphasis: "box", color: "#20D68A" }]), template: POP, W, H });
    const lines = dialogues(track.ass);
    const box = lines.filter((l) => l.includes("\\p1") && l.includes(assFill("#20D68A")));
    expect(box).toHaveLength(1);
    const text = lines.filter((l) => textOf(l) === POP_CASE("almost"));
    for (const l of text) {
      expect(l).toContain(assFill("#0A0A0A"));
      expect(l).toContain("\\bord0\\shad0");
    }
  });

  it("boxes in the accent colour when the word has no colour", () => {
    const track = buildCaptionTrack({ words: words([{ emphasis: "box" }]), template: POP, W, H, accent: "#4EA8FF" });
    expect(dialogues(track.ass).some((l) => l.includes("\\p1") && l.includes(assFill("#4EA8FF")))).toBe(true);
  });

  it("shakes a shaken word only while it's spoken", () => {
    const track = buildCaptionTrack({ words: words([undefined, undefined, { emphasis: "shake" }]), template: POP, W, H });
    const quit = dialogues(track.ass).filter((l) => textOf(l) === POP_CASE("quit"));
    const shaking = quit.filter((l) => l.includes("\\t(0,52,\\frz"));
    expect(shaking).toHaveLength(1);
    expect(quit.length).toBeGreaterThan(1);
  });

  it("sets a bigger word larger and makes room for it", () => {
    const plain = buildCaptionTrack({ words: words(), template: POP, W, H });
    const big = buildCaptionTrack({ words: words([undefined, { emphasis: "bigger" }]), template: POP, W, H });
    const wordOf = (t: typeof plain, i: number) => t.layout.chunks.flatMap((c) => c.words).find((w) => w.index === i)!;
    expect(wordOf(big, 1).fs).toBeCloseTo(wordOf(plain, 1).fs * BIGGER_SCALE, 3);
    expect(wordOf(big, 1).w).toBeGreaterThan(wordOf(plain, 1).w * 1.2);
    expect(wordOf(big, 0).fs).toBeCloseTo(wordOf(plain, 0).fs, 3);
  });

  it("draws a user-picked emoji even on a template without emoji, at the end of the word", () => {
    const track = buildCaptionTrack({ words: words([undefined, undefined, { emoji: "🔥" }]), template: POP, W, H });
    expect(track.emoji).toHaveLength(1);
    const quit = track.layout.chunks.flatMap((c) => c.words).find((w) => w.index === 2)!;
    expect(track.emoji[0]!.x).toBeGreaterThan(quit.x + quit.w / 2);
    // The automatic plan alone draws nothing on this template.
    expect(buildCaptionTrack({ words: words(), template: POP, W, H, emoji: { 2: "🔥" } }).emoji).toHaveLength(0);
  });

  it("lets a user-picked emoji replace the automatic one", () => {
    const withEmoji = CAPTION_TEMPLATES.find((t) => t.emoji === "end")!;
    const track = buildCaptionTrack({ words: words([undefined, undefined, { emoji: "💡" }]), template: withEmoji, W, H, emoji: { 2: "🔥" } });
    expect(track.emoji).toHaveLength(1);
    expect(track.layout.chunks.flatMap((c) => c.words).find((w) => w.index === 2)!.emoji).toBe("💡");
  });
});

describe("timeline → engine", () => {
  it("carries word styles from caption cues into the template groups", () => {
    const cue = {
      type: "caption", id: "c1", timelineStart: 1, duration: 2, text: "hi there", templateId: POP.id,
      words: [{ word: "hi", startMs: 0, endMs: 500, style: { color: "#00FF00" } }, { word: "there", startMs: 500, endMs: 900 }],
    } as unknown as CaptionClip;
    const [group] = templateCaptionGroups([cue]);
    expect(group!.words[0]).toEqual({ word: "hi", start: 1000, end: 1500, style: { color: "#00FF00" } });
    expect(group!.words[1]!.style).toBeUndefined();
  });
});

function POP_CASE(word: string): string {
  return POP.type.case === "upper" ? word.toLocaleUpperCase() : POP.type.case === "lower" ? word.toLocaleLowerCase() : word;
}
