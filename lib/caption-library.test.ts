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
  it("has 150 templates in 21 families, every family used", () => {
    expect(CAPTION_TEMPLATES).toHaveLength(150);
    expect(CAPTION_FAMILIES).toHaveLength(21);
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

describe("drop 1 (templates 51-60)", () => {
  const find = (id: string) => CAPTION_TEMPLATES.find((x) => x.id === id)!;
  const two = [{ word: "left", start: 0, end: 400 }, { word: "right", start: 400, end: 800 }];
  const lines = (id: string, words = two) => buildCaptionTrack({ words, template: find(id), W, H }).ass.split("\n").filter((l) => l.startsWith("Dialogue:"));

  it("ships the ten new templates with a mix of plans", () => {
    const ids = ["sunset", "limesoda", "molten", "oceandrop", "peachfizz", "duotone", "tuttifrutti", "popart", "pillparade", "highlighterpack"];
    const drop = ids.map(find);
    expect(drop.every(Boolean)).toBe(true);
    expect(new Set(drop.map((t) => t.tier))).toEqual(new Set(["free", "creator", "pro"]));
    expect(drop.filter((t) => t.family === "gradient")).toHaveLength(5);
    expect(drop.filter((t) => t.family === "chroma")).toHaveLength(5);
  });

  it("gives every word of Tutti Frutti its own colour, spoken or not", () => {
    const ass = lines("tuttifrutti").join("\n");
    expect(ass).toContain("\\1c&H6B6BFF&"); // word 0: #FF6B6B
    expect(ass).toContain("\\1c&H3DD9FF&"); // word 1: #FFD93D
  });

  it("rotates Pill Parade's chip colour per word and draws it as a pill", () => {
    const shapes = lines("pillparade").filter((l) => l.includes("\\p1"));
    expect(shapes.some((l) => l.includes("\\1c&H303BFF&"))).toBe(true); // #FF3B30
    expect(shapes.some((l) => l.includes("\\1c&HFF840A&"))).toBe(true); // #0A84FF
  });

  it("keeps a tilt-swapped word leaning after it's spoken, alternating sides", () => {
    const text = lines("duotone").filter((l) => !l.includes("\\p1"));
    expect(text.some((l) => l.includes("\\frz6"))).toBe(true);
    expect(text.some((l) => l.includes("\\frz-6"))).toBe(true);
  });

  it("frames a stamped word with an unfilled outline box", () => {
    const frames = lines("popart").filter((l) => l.includes("\\p1") && l.includes("\\1a&HFF&"));
    expect(frames.length).toBeGreaterThan(0);
  });

  it("drops a word in with \\move from above, then squashes it", () => {
    const ass = lines("oceandrop").join("\n");
    expect(ass).toMatch(/\\move\([\d.]+,[\d.]+,[\d.]+,[\d.]+\)/);
    expect(ass).toContain("\\fscx116\\fscy80");
  });

  it.each([["limesoda", "\\fscx124"], ["molten", "\\fscx30"], ["peachfizz", "\\fscx155"], ["tuttifrutti", "\\fax-0.29"]])("%s animates its spoken word", (id, tag) => {
    expect(lines(id).join("\n")).toContain(tag);
  });
});

describe("templates 61-150", () => {
  const find = (id: string) => CAPTION_TEMPLATES.find((x) => x.id === id)!;
  const words = ["build", "bigger", "every", "single", "day", "now"].map((w, i) => ({ word: w, start: 200 + i * 400, end: 560 + i * 400 }));
  const track = (id: string, extra: Partial<Parameters<typeof buildCaptionTrack>[0]> = {}) => buildCaptionTrack({ words, template: find(id), W, H, ...extra });
  const dialogue = (id: string, extra = {}) => track(id, extra).ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  const textOf = (l: string) => l.replace(/\{[^}]*\}/g, "").split(",").slice(9).join(",");

  it("makes every new template multi-colour", () => {
    const drop = CAPTION_TEMPLATES.slice(50);
    for (const t of drop) {
      const c = t.colors;
      expect(!!(c.gradient || c.cycle || c.wordColors || c.boxCycle || c.letterColors || c.palette), t.id).toBe(true);
    }
  });

  it.each([["wave"], ["cascade"], ["prism"]])("%s draws the spoken word letter by letter", (id) => {
    const lines = dialogue(id);
    expect(lines.some((l) => textOf(l).length === 1 && /[A-Za-z]/.test(textOf(l)))).toBe(true);
  });

  it("colours each letter of Prism from its palette", () => {
    const ass = dialogue("prism").join("\n");
    expect(ass).toContain("\\1c&H5F5AFF&"); // #FF5A5F
    expect(ass).toContain("\\1c&H00B4FF&"); // #FFB400
  });

  it("sets symbols in the bundled symbol font", () => {
    for (const id of ["badgedrop", "splitpersonality", "aurora"]) {
      expect(dialogue(id).join("\n"), id).toContain("\\fnNoto Sans Symbols 2");
    }
  });

  it("pops a badge into the top-left corner of every line", () => {
    const badge = dialogue("breaking").filter((l) => textOf(l).includes("LIVE"));
    expect(badge.length).toBeGreaterThan(0);
  });

  it("fills the review stars one word at a time", () => {
    const rows = dialogue("reviewstars").filter((l) => textOf(l).includes("★"));
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("slaps a sticker emoji on a white disc and orbits another", () => {
    const sticker = track("slapsticker", { emoji: { 0: "😱" } });
    expect(sticker.emoji.some((e) => e.size >= 0.2 * W)).toBe(true);
    const orbit = buildCaptionTrack({ words, template: { ...find("wave"), emoji: "orbit" }, W, H, emoji: { 1: "🏄" } });
    expect(orbit.emoji[0]?.orbit).toBeDefined();
    const chain = buildCaptionFilterChain({ track: orbit, assPath: "/tmp/x.ass", inLabel: "in", outLabel: "out" });
    expect(chain).toContain("cos(");
    expect(chain).toContain("sin(");
  });

  it("brings lines in with their entry", () => {
    expect(dialogue("sunlit").join("\n")).toContain("\\fad(300,0)");
    expect(dialogue("punchin").join("\n")).toMatch(/\\frz25\\t\(0,360,\\frz0\)/);
  });

  it.each([
    ["block3d", /\\org\([\d.]+,[\d.]+\)\\frz1\.6/],      // sway
    ["moodring", /\\t\(\d+,\d+,\\1c&H[0-9A-F]{6}&\)/],   // hue drift
    ["clubpulse", /\\fscx10[0-4]\\fscy10[0-4]/],          // pulse
    ["ultraviolet", /\\3a&H[0-9A-F]{2}&/],                // breathing glow
    ["aurora", /\\move\(/],                                // float
  ])("%s runs its idle loop", (id, re) => {
    expect(dialogue(id).join("\n")).toMatch(re);
  });

  it("decodes the same random glyphs on every render", () => {
    expect(track("decoder").ass).toBe(track("decoder").ass);
    expect(dialogue("decoder").some((l) => /[!<>=+*^?#]/.test(textOf(l)))).toBe(true);
  });

  it("sweeps a shimmer band above the word", () => {
    expect(dialogue("goldrush").some((l) => l.startsWith("Dialogue: 3,") && l.includes("\\clip("))).toBe(true);
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
