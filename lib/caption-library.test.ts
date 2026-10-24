// @vitest-environment node
// The Clipiro caption template library and the engine that renders it.
import { describe, expect, it } from "vitest";
import {
  CAPTION_FAMILIES,
  CAPTION_TEMPLATES,
  LEGACY_TEMPLATE_ALIASES,
  parseCaptionSample,
  resolveTemplateId,
  templateTierAllowed,
  type CaptionTemplateSpec,
} from "@clipiro/shared/caption-templates";
import { emojiAssetName, planEmoji } from "@clipiro/shared/caption-emoji";
import { buildCaptionTrack, buildCaptionFilterChain } from "@/lib/captions/engine";
import { readCaptionOverride } from "@/lib/captions/clip-captions";

const W = 1080;
const H = 1920;

function sample(t: CaptionTemplateSpec) {
  const tokens = parseCaptionSample(t.sample);
  return {
    words: tokens.map((tok, i) => ({ word: tok.text, start: 200 + i * 360, end: 530 + i * 360, speaker: `s${Math.floor(i / 4) % 2}` })),
    emoji: Object.fromEntries(tokens.flatMap((tok, i) => (tok.emoji ? [[i, tok.emoji]] : []))) as Record<number, string>,
    emphasis: tokens.flatMap((tok, i) => (tok.emphasis ? [i] : [])),
  };
}

describe("the catalogue", () => {
  it("has 50 templates in 9 families, every family used", () => {
    expect(CAPTION_TEMPLATES).toHaveLength(50);
    expect(CAPTION_FAMILIES).toHaveLength(9);
    for (const f of CAPTION_FAMILIES) expect(CAPTION_TEMPLATES.some((t) => t.family === f.id), f.id).toBe(true);
  });

  it("gives every template a unique lowercase id", () => {
    const ids = CAPTION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("keeps free templates in every common family so the free plan is usable", () => {
    const free = CAPTION_TEMPLATES.filter((t) => t.tier === "free");
    expect(free.length).toBeGreaterThanOrEqual(8);
    expect(free.map((t) => t.id)).toContain("clean");
  });
});

describe("retired ids", () => {
  it("maps every old native and partner id to a current template", () => {
    for (const [from, to] of Object.entries(LEGACY_TEMPLATE_ALIASES)) {
      expect(resolveTemplateId(from), from).toBe(to);
      expect(CAPTION_TEMPLATES.some((t) => t.id === to)).toBe(true);
    }
    expect(resolveTemplateId("hormozi")).toBe("boardroom");
    expect(resolveTemplateId("viral-beast")).toBe("slam");
    expect(resolveTemplateId("jess")).toBe("shockwave");
  });

  it("falls back to the default for unknown or empty ids", () => {
    expect(resolveTemplateId("nope")).toBe("clean");
    expect(resolveTemplateId(null)).toBe("clean");
  });
});

describe("plan gate", () => {
  it("orders free < creator < pro < studio", () => {
    expect(templateTierAllowed("free", "free")).toBe(true);
    expect(templateTierAllowed("creator", "free")).toBe(false);
    expect(templateTierAllowed("creator", "creator")).toBe(true);
    expect(templateTierAllowed("pro", "creator")).toBe(false);
    expect(templateTierAllowed("pro", "studio")).toBe(true);
    expect(templateTierAllowed("pro", null)).toBe(false);
  });
});

describe("every template renders", () => {
  it.each(CAPTION_TEMPLATES.map((t) => [t.id, t] as const))("%s builds a valid track inside the safe zone", (_id, t) => {
    const { words, emoji, emphasis } = sample(t);
    const track = buildCaptionTrack({ words, template: t, W, H, durationMs: 9000, emoji, emphasis, rms: { hz: 20, values: [0.2, 0.8, 0.5] } });
    expect(track.ass).toContain(`PlayResX: ${W}`);
    expect(track.ass).toContain("Dialogue:");
    // Every word is pinned, and no caption line lands in the bottom 20% that
    // platforms cover with their buttons.
    for (const ch of track.layout.chunks) expect(ch.block.y1, `${t.id} chunk ${ch.index}`).toBeLessThanOrEqual(0.8 * H + 1);
    // Fonts are referenced by exact face name, never synthesised.
    expect(track.ass).toMatch(/\\fn[A-Z]/);
    const chain = buildCaptionFilterChain({ track, assPath: "/tmp/x.ass", inLabel: "in", outLabel: "out" });
    expect(chain).toContain("ass=filename=");
    expect(chain).toContain("shaping=complex");
    expect(chain.endsWith("[out]")).toBe(true);
  });
});

describe("open questions, answered", () => {
  it("colours each speaker differently in Two Mic", () => {
    const t = CAPTION_TEMPLATES.find((x) => x.id === "twomic")!;
    const words = ["so", "why", "did", "you", "leave", "google", "honestly", "the"].map((w, i) => ({
      word: w, start: i * 400, end: i * 400 + 350, speaker: i < 4 ? "speaker_0" : "speaker_1",
    }));
    const ass = buildCaptionTrack({ words, template: t, W, H }).ass;
    expect(ass).toContain("\\1c&HFFFFFF&");   // speaker 0: white
    expect(ass).toContain("\\1c&HFFE98F&");   // speaker 1: #8FE9FF in ASS byte order
  });

  it("draws a true vertical gradient as clipped colour bands", () => {
    const t = CAPTION_TEMPLATES.find((x) => x.id === "splittone")!;
    const words = [{ word: "last", start: 0, end: 400 }, { word: "second", start: 400, end: 800 }];
    const ass = buildCaptionTrack({ words, template: t, W, H }).ass;
    const bands = ass.split("\n").filter((l) => l.includes("\\clip(0,"));
    expect(bands.length).toBeGreaterThanOrEqual(8);
  });

  it("blurs the real video under a fixed glass panel, only while it shows", () => {
    const t = CAPTION_TEMPLATES.find((x) => x.id === "glass")!;
    const words = Array.from({ length: 10 }, (_, i) => ({ word: `w${i}`, start: i * 300, end: i * 300 + 250 }));
    const track = buildCaptionTrack({ words, template: t, W, H });
    expect(track.glass).not.toBeNull();
    expect(track.glass!.windows.length).toBeGreaterThan(0);
    const chain = buildCaptionFilterChain({ track, assPath: "/tmp/x.ass", inLabel: "in", outLabel: "out" });
    expect(chain).toMatch(/crop=\d+:\d+:\d+:\d+,boxblur=/);
    expect(chain).toContain("enable='between(t,");
  });

  it("falls back to a Devanagari font for Hindi words in a Latin-only template", () => {
    const t = CAPTION_TEMPLATES.find((x) => x.id === "boardroom")!; // Montserrat: no Devanagari
    const ass = buildCaptionTrack({ words: [{ word: "पैसा", start: 0, end: 400 }], template: t, W, H }).ass;
    expect(ass).toContain("\\fnMukta ExtraBold");
  });

  it("plans colour emoji images for Hindi keywords too", () => {
    const plan = planEmoji([{ word: "पैसा" }], true);
    expect(plan[0]).toBe("💰");
    expect(emojiAssetName(plan[0]!)).toBe("emoji_u1f4b0.png");
  });
});

describe("per-clip settings", () => {
  it("reads the three tweaks and ignores retired style fields", () => {
    const o = readCaptionOverride({ templateId: "glitch", accent: "#FF0000", sizeScale: 9, positionY: 3, fontName: "Arial", baseColor: "&H00FFFFFF" });
    expect(o).toEqual({ templateId: "glitch", accent: "#FF0000", sizeScale: 1.4, positionY: 15, faceY: null });
  });

  it("keeps the face-aware default separate from an explicit position", () => {
    expect(readCaptionOverride({ captionPositionY: 62 })).toMatchObject({ positionY: null, faceY: 62 });
  });
});
