// Turns a caption layout into an ASS subtitle file plus an overlay plan
// (colour emoji images and the glass blur rectangle) for the filtergraph.
//
// Every word is its own event pinned with \pos, split into the time it is
// unspoken (future), spoken (active) and already spoken (past). Motions are
// libass override tags on the active segment; shapes (word boxes, highlighter,
// underline, bubbles, containers) are \p1 drawings on lower layers. Layers:
//   0 containers and extras   1 word shapes, glow, RGB ghosts   2 text
//
// The browser preview (app/components/captions/CaptionTemplateRender.tsx)
// implements the same motions in CSS. Change both together.

import { LETTER_MOTIONS, SCRAMBLE_STEPS, SCRAMBLE_STEP_MS, scrambledWord, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { emojiAssetName } from "@clipiro/shared/caption-emoji";
import { assFontSize, hasGlyphs, measureText, resolveFace, type FontFace } from "./fonts";
import { layoutCaptions, type CaptionLayout, type EngineWord, type PlacedChunk, type PlacedWord } from "./layout";
import { assAlpha, assColor, assTime, mixHex, roundedRect, skewRect } from "./draw";

export interface CaptionTrackOptions {
  words: EngineWord[];
  template: CaptionTemplateSpec;
  /** Frame size the ASS is authored for (PlayResX/Y); the video is scaled to it by libass. */
  W: number;
  H: number;
  /** Clip length; used for full-length extras such as letterbox bars. */
  durationMs?: number;
  /** User's accent colour override (#RRGGBB). */
  accent?: string | null;
  sizeScale?: number;
  /** Block centre as a percentage of frame height. */
  positionY?: number | null;
  /** Per-word speech energy 0..1, aligned to `words`. */
  energy?: number[];
  /** Indices of emphasised words. */
  emphasis?: number[];
  wordsPerSec?: number;
  /** Word index → emoji (from planEmoji). */
  emoji?: Record<number, string>;
  /** Loudness envelope for the audio-bars extra. */
  rms?: { hz: number; values: number[] } | null;
}

export interface EmojiOverlay {
  /** File name under public/emoji. */
  file: string;
  /** Rendered size in px (square). */
  size: number;
  /** Top-left position at `start`, in px. */
  x: number;
  y: number;
  /** Seconds. */
  start: number;
  end: number;
  /** Optional linear motion in px per second (burst, rain). */
  vx?: number;
  vy?: number;
  /** Optional circular motion around (cx,cy) in px, one turn per `period` seconds (orbit). */
  orbit?: { cx: number; cy: number; r: number; period: number };
}

export interface GlassPlan {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Seconds, merged. Blur is only applied while a panel is on screen. */
  windows: [number, number][];
}

export interface CaptionTrack {
  ass: string;
  emoji: EmojiOverlay[];
  glass: GlassPlan | null;
  layout: CaptionLayout;
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/** Text colour on a boxed word (WordEmphasis "box"). */
const BOX_TEXT = "#0A0A0A";

type Segment = { s: number; e: number; pos: string; tags: string };

/** Rotates a #RRGGBB colour's hue by `deg` (the hue-drift loop). */
function hueRotate(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  if (d) h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  h = (((h + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Triangle wave: 1 at phase 0, -1 at phase 0.5, back to 1 at phase 1. */
const tri = (phase: number) => {
  const p = ((phase % 1) + 1) % 1;
  return p < 0.5 ? 1 - 4 * p : -3 + 4 * p;
};

export function buildCaptionTrack(opts: CaptionTrackOptions): CaptionTrack {
  const t = opts.template;
  const c = t.colors;
  const layout = layoutCaptions({
    words: opts.words,
    template: t,
    W: opts.W,
    H: opts.H,
    sizeScale: opts.sizeScale,
    positionY: opts.positionY,
    emphasis: opts.emphasis,
    emoji: opts.emoji,
    wordsPerSec: opts.wordsPerSec,
  });
  const { W, H, emPx: em } = layout;
  const events: string[] = [];
  const emoji: EmojiOverlay[] = [];
  const accentHex = opts.accent && /^#[0-9a-fA-F]{6}$/.test(opts.accent) ? opts.accent : c.accent;

  /** The line being written, for line entries and loops (which run on every event of the line). */
  let line: { ch: PlacedChunk; R: number; cx: number; cy: number } | null = null;

  /**
   * Tags that run a looping track over [s,e]: `at(ms)` gives the tag value
   * `ms` after the line started, and libass interpolates between keyframes
   * every `step` ms, so every event of the line moves in sync.
   */
  const loopTags = (s: number, e: number, step: number, at: (ms: number) => string): string => {
    const t0 = line!.ch.start;
    let out = at(s - t0);
    let prev = s;
    for (let b = t0 + (Math.floor((s - t0) / step) + 1) * step; prev < e && b - s < 30000; b += step) {
      const to = Math.min(b, e);
      out += `\\t(${Math.round(prev - s)},${Math.round(to - s)},${at(to - t0)})`;
      prev = to;
    }
    return out;
  };

  /** Applies the template's line entry and idle loop to one event; float may split it. */
  const decorate = (s: number, e: number, tags: string): [number, number, string][] => {
    if (!line || (!t.entry && !t.loop)) return [[s, e, tags]];
    const { ch, R, cx, cy } = line;
    let out = tags;
    const pos = /\\pos\(([-\d.]+),([-\d.]+)\)/.exec(out);
    if (t.entry && s - ch.start < 10) {
      if (t.entry === "swirl") {
        out += `\\org(${f1(cx)},${f1(cy)})\\frz${R + 25}\\t(0,360,\\frz${R})\\fad(200,0)`;
      } else {
        // Words that already move (rise, drop) keep their own path and just fade in.
        const dy = t.entry === "up" ? 0.4 * em : -1.2 * em;
        if (pos) out = out.replace(pos[0], `\\move(${pos[1]},${f1(+pos[2] + dy)},${pos[1]},${pos[2]},0,${t.entry === "up" ? 300 : 380})`);
        out += `\\fad(${t.entry === "up" ? 300 : 150},0)`;
      }
    }
    const animated = out.includes("\\t(");
    switch (t.loop) {
      case "sway":
        out += `\\org(${f1(cx)},${f1(cy)})` + loopTags(s, e, 1400, (ms) => `\\frz${f1(R + 1.6 * tri(ms / 2800))}`);
        break;
      case "pulse":
        if (!animated) out += loopTags(s, e, 600, (ms) => { const k = Math.round(102 - 2 * tri(ms / 1200)); return `\\fscx${k}\\fscy${k}`; });
        break;
      case "hue": {
        const col = /\\1c&H([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})&/i.exec(out);
        if (col) {
          const hex = `#${col[3]}${col[2]}${col[1]}`;
          out += loopTags(s, e, 500, (ms) => `\\1c${assColor(hueRotate(hex, (360 * ms) / 3000))}`);
        }
        break;
      }
      case "float": {
        if (!pos || out.includes("\\move(")) break;
        const off = (ms: number) => f1(+pos[2] - 0.045 * em * (1 - tri(ms / 2400)) / 2);
        if (animated || e - s <= 1200) return [[s, e, out.replace(pos[0], `\\move(${pos[1]},${off(s - ch.start)},${pos[1]},${off(e - ch.start)})`)]];
        const pieces: [number, number, string][] = [];
        for (let a = s; a < e; ) {
          const b = Math.min(e, ch.start + (Math.floor((a - ch.start) / 1200) + 1) * 1200);
          pieces.push([a, b, out.replace(pos[0], `\\move(${pos[1]},${off(a - ch.start)},${pos[1]},${off(b - ch.start)})`)]);
          a = b;
        }
        return pieces;
      }
    }
    return [[s, e, out]];
  };

  const ev = (layer: number, s: number, e: number, tags: string, text: string) => {
    if (e - s < 10) return;
    for (const [ps, pe, pt] of decorate(s, e, tags)) {
      if (pe - ps < 10) continue;
      events.push(`Dialogue: ${layer},${assTime(ps)},${assTime(pe)},Default,,0,0,0,,{${pt}}${text}`);
    }
  };

  // ── Symbols: glyphs from the bundled symbol font, as plain ASS text ────────
  const labelFace = resolveFace("Inter", 700, false);
  const symbolFace = resolveFace("Noto Sans Symbols 2", 400, false);
  /** ASS text for `text` at an em of `px`, switching to the symbol font for glyphs `primary` lacks. */
  const glyphRun = (text: string, primary: FontFace, px: number): string => {
    let out = "";
    let current: FontFace | null = null;
    for (const ch of Array.from(text)) {
      const face = /\s/.test(ch) || hasGlyphs(primary, ch) ? primary : symbolFace;
      if (face !== current) {
        out += `{\\fn${face.fullName}\\fs${f1(assFontSize(face, px))}}`;
        current = face;
      }
      out += ch;
    }
    return out;
  };
  const P = (x: number, y: number) => `\\pos(${f1(x)},${f1(y)})`;
  /** One symbol glyph; `pos` is a \pos or \move tag. */
  const symEvent = (layer: number, s: number, e: number, pos: string, glyph: string, color: string, px: number, tags = "") =>
    ev(layer, s, e, `\\an5${pos}\\b0\\i0\\bord${f1(0.05 * px)}\\3c&H000000&\\3a&H90&\\shad0\\1c${assColor(color)}\\1a${assAlpha(color)}${tags}`, glyphRun(glyph, labelFace, px));
  /** A gentle 100 → 104% pulse for the whole of [0,dur] ms. */
  const pulseTags = (dur: number) => {
    let out = "";
    for (let k = 0; k * 450 < dur && k < 60; k++) out += `\\t(${k * 450},${(k + 1) * 450},\\fscx${k % 2 ? 100 : 104}\\fscy${k % 2 ? 100 : 104})`;
    return out;
  };
  const sym = t.symbols;
  const symColor = (k: number) => sym!.colors[k % sym!.colors.length];
  const symGlyphs = sym ? Array.from(sym.glyphs) : [];

  // ── Outline / shadow, shared by every text event ──────────────────────────
  const boxed = ["pill", "line", "sticker", "bar", "glass", "dark", "wordbox"].includes(t.container) || t.motion === "bubble" || t.motion === "blocks";
  let strokeTags: string;
  if (t.motion === "hollow") {
    strokeTags = `\\bord${f1(0.045 * em)}\\3c${assColor(c.outline ?? "#FFFFFF")}\\3a${assAlpha(c.outline ?? "#FFFFFF")}`;
  } else if (!boxed && c.outline && (c.outlineWidth ?? 0) > 0) {
    strokeTags = `\\bord${f1(Math.max(1, (c.outlineWidth ?? 0) * 0.018 * em))}\\3c${assColor(c.outline)}\\3a${assAlpha(c.outline)}`;
  } else if (!boxed && t.motion !== "rgb") {
    strokeTags = `\\bord${f1(0.02 * em)}\\3c&H000000&\\3a&HA0&\\blur0.6`;
  } else {
    strokeTags = "\\bord0";
  }
  /** The outline-only look of a word not yet drawn in (draw motion), and how it fills in. */
  const outlineW = f1(Math.max(1, (c.outlineWidth ?? 1) * 0.018 * em));
  const drawPending = (col: string) => `\\1a&HFF&\\3c${assColor(col)}\\3a&H00&\\bord${f1(0.035 * em)}\\shad0`;
  const shadowTags = c.hardShadow
    ? `\\xshad${f1(0.08 * em)}\\yshad${f1(0.1 * em)}\\4c${assColor(c.hardShadow)}\\4a${assAlpha(c.hardShadow)}`
    : "\\shad0";

  // A user's word colour holds in every state; a boxed word is dark text on
  // the box (captions/style.ts, mirrored by CaptionTemplateRender).
  const wordOwnColor = (w: PlacedWord) => (w.style?.emphasis === "box" ? BOX_TEXT : w.style?.color);
  const fixedColor = (w: PlacedWord) => (c.wordColors?.length ? c.wordColors[w.index % c.wordColors.length] : undefined);
  const baseColor = (w: PlacedWord) => wordOwnColor(w) ?? fixedColor(w) ?? (c.speakers?.length ? c.speakers[w.speaker % c.speakers.length] : c.base);
  const activeColor = (w: PlacedWord) => wordOwnColor(w) ?? fixedColor(w) ?? (c.cycle?.length ? c.cycle[w.index % c.cycle.length] : accentHex);
  /** The box behind the spoken word (boxword, marker): rotates with boxCycle when set. */
  const boxColor = (w: PlacedWord, fallback: string) => (c.boxCycle?.length ? c.boxCycle[w.index % c.boxCycle.length] : c.box ?? fallback);
  /** Tilt swap: even words lean left, odd words right (CSS degrees; \frz is the opposite sign). */
  const tiltOf = (w: PlacedWord) => (w.index % 2 ? 6 : -6);

  const rotTags = (ch: PlacedChunk) => {
    if (!ch.rotation) return { tags: "", frz: 0 };
    const cx = (ch.block.x0 + ch.block.x1) / 2;
    const cy = (ch.block.y0 + ch.block.y1) / 2;
    return { tags: `\\org(${f1(cx)},${f1(cy)})\\frz${-ch.rotation}`, frz: -ch.rotation };
  };

  /** Text event(s) for one word: one event, or 8 colour bands for a gradient fill. */
  const textEvent = (s: number, e: number, w: PlacedWord, active: boolean, pos: string, tags: string, rot: string, colorHex: string) => {
    const face = active ? w.activeFace : w.face;
    const fs = active ? w.activeFs : w.fs;
    const fillAlpha = assAlpha(c.base);
    const boxedWord = w.style?.emphasis === "box";
    const common = `\\an5${pos}${rot}\\fn${face.fullName}\\fs${f1(fs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}${boxedWord ? "\\bord0\\shad0" : strokeTags + shadowTags}\\1a${t.motion === "hollow" && !boxedWord ? "&HFF&" : fillAlpha}`;
    const grad = c.gradient && (c.gradient.target === "all" || active) ? c.gradient : null;
    if (!grad) {
      ev(2, s, e, `${common}\\1c${assColor(colorHex)}${tags}`, w.text);
      return;
    }
    const top = w.y - 0.62 * em;
    const bottom = w.y + 0.55 * em;
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      const y0 = i === 0 ? 0 : top + ((bottom - top) * i) / bands;
      const y1 = i === bands - 1 ? H : top + ((bottom - top) * (i + 1)) / bands;
      const col = mixHex(grad.from, grad.to, (i + 0.5) / bands);
      ev(2, s, e, `${common}\\1c${assColor(col)}\\clip(0,${f1(y0)},${W},${f1(y1)})${tags}`, w.text);
    }
  };

  const shapeEvent = (layer: number, s: number, e: number, an: number, x: number, y: number, rot: string, path: string, colorHex: string, tags = "") => {
    ev(layer, s, e, `\\an${an}\\pos(${f1(x)},${f1(y)})${rot}\\bord0\\shad0\\1c${assColor(colorHex)}\\1a${assAlpha(colorHex)}${tags}\\p1`, `${path}{\\p0}`);
  };

  // ── Motion tag sets ───────────────────────────────────────────────────────
  const popTags = (w: PlacedWord) => {
    const energy = opts.energy?.[w.index] ?? 0;
    const p = Math.round(Math.min(1.25, 1.1 + energy * 0.1 + (w.emphasis ? 0.05 : 0)) * 100);
    return `\\fscx85\\fscy85\\t(0,99,\\fscx${p}\\fscy${p})\\t(99,180,\\fscx110\\fscy110)`;
  };
  const POPS = "\\t(0,96,\\fscx108\\fscy108)\\t(96,160,\\fscx105\\fscy105)";
  const slamTags = (R: number) =>
    `\\alpha&HFF&\\fscx180\\fscy180\\t(0,126,\\alpha&H00&\\fscx94\\fscy94)\\t(126,174,\\fscx105\\fscy105\\frz${R + 2})\\t(174,224,\\fscx100\\fscy100\\frz${R - 1.5})\\t(224,280,\\frz${R})`;
  const shakeTags = (R: number) =>
    `\\fscx108\\fscy108\\t(0,52,\\frz${R + 3})\\t(52,104,\\frz${R - 3})\\t(104,156,\\frz${R + 2})\\t(156,208,\\frz${R - 1})\\t(208,260,\\frz${R})`;
  const wobbleTags = (R: number) =>
    `\\frz${R + 8}\\fscx90\\fscy90\\t(0,120,\\frz${R - 6}\\fscx108\\fscy108)\\t(120,210,\\frz${R + 3})\\t(210,300,\\frz${R}\\fscx104\\fscy104)`;
  const STEP = "\\fscx60\\fscy60\\t(80,81,\\fscx125\\fscy125)\\t(160,161,\\fscx110\\fscy110)";
  const FLICKER = "\\alpha&HFF&\\t(56,57,\\alpha&H00&)\\t(98,99,\\alpha&HBF&)\\t(154,155,\\alpha&H00&)\\t(196,197,\\alpha&H66&)\\t(280,281,\\alpha&H00&)";
  const BLURIN = "\\blur12\\alpha&HFF&\\t(0,260,\\blur0\\alpha&H00&)";
  const HEARTBEAT = "\\t(0,84,\\fscx124\\fscy124)\\t(84,168,\\fscx100\\fscy100)\\t(168,252,\\fscx117\\fscy117)\\t(252,420,\\fscx106\\fscy106)";
  const PUNCH = "\\fscx30\\fscy30\\blur6\\alpha&HFF&\\t(0,144,\\fscx130\\fscy130\\blur0\\alpha&H00&)\\t(144,240,\\fscx112\\fscy112)";
  const ELASTIC = "\\fscx155\\fscy45\\t(0,147,\\fscx80\\fscy128)\\t(147,252,\\fscx113\\fscy90)\\t(252,336,\\fscx97\\fscy104)\\t(336,420,\\fscx105\\fscy105)";
  const JELLY = "\\t(0,126,\\fax-0.29\\fscx112\\fscy112)\\t(126,210,\\fax0.19)\\t(210,294,\\fax-0.09)\\t(294,420,\\fax0\\fscx105\\fscy105)";
  // Stamp lands rotated 6° anticlockwise (CSS -6deg), so \frz goes +20 → +8 → +6.
  const stampTags = (R: number) =>
    `\\alpha&HFF&\\fscx250\\fscy250\\frz${R + 20}\\t(0,150,\\alpha&H00&\\fscx90\\fscy90\\frz${R + 8})\\t(150,300,\\fscx100\\fscy100\\frz${R + 6})`;
  const tiltTags = (w: PlacedWord, R: number) => `\\frz${R}\\fscx75\\fscy75\\t(0,220,\\frz${R - tiltOf(w)}\\fscx112\\fscy112)`;
  const FLIP = "\\frx90\\alpha&HFF&\\t(0,190,\\frx-18\\alpha&H00&)\\t(190,320,\\frx0)";
  const spinTags = (R: number) => `\\frz${R + 200}\\fscx20\\fscy20\\alpha&HFF&\\t(0,238,\\frz${R - 10}\\fscx114\\fscy114\\alpha&H00&)\\t(238,340,\\frz${R}\\fscx106\\fscy106)`;
  // Hangs from the word's top edge (CSS rotate -28 → 16 → -7 → 0, \frz the opposite sign).
  const swingTags = (w: PlacedWord, R: number) =>
    `\\org(${f1(w.x)},${f1(w.y - 0.55 * em)})\\frz${R + 28}\\t(0,168,\\frz${R - 16})\\t(168,294,\\frz${R + 7})\\t(294,420,\\frz${R})`;
  const tadaTags = (R: number) =>
    `\\t(0,62,\\fscx90\\fscy90\\frz${R + 5})\\t(114,166,\\fscx116\\fscy116\\frz${R - 5})\\t(166,218,\\frz${R + 5})\\t(218,270,\\frz${R - 5})` +
    `\\t(270,322,\\frz${R + 5})\\t(322,374,\\frz${R - 5})\\t(374,520,\\fscx108\\fscy108\\frz${R})`;
  const STRETCH = () => `\\fsp${f1(0.7 * em)}\\alpha&HFF&\\blur2\\t(0,360,\\fsp${f1(layout.trackingPx)}\\alpha&H00&\\blur0)`;
  const INK = "\\blur12\\fscx55\\fscy55\\alpha&HFF&\\t(0,300,\\blur0\\fscx100\\fscy100\\alpha&H00&)";
  const ZOOM = "\\fscx114\\fscy114\\blur4\\alpha&HFF&\\t(0,900,0.6,\\fscx100\\fscy100\\blur0\\alpha&H00&)";
  const FADE = "\\fad(320,0)";

  const activeMotionTags = (w: PlacedWord, R: number): string => {
    switch (t.motion) {
      case "pop": case "split": case "bubble": return popTags(w);
      case "pops": case "boxword": case "dim": case "fontswitch": return POPS;
      case "hollow": return `\\1a&HFF&\\t(0,160,\\1a&H00&)${POPS}`;
      case "slam": case "blocks": return slamTags(R);
      case "shake": return shakeTags(R);
      case "wobble": return wobbleTags(R);
      case "step": return STEP;
      case "flicker": return FLICKER;
      case "blur": return BLURIN;
      case "stack": return popTags(w);
      case "heartbeat": return HEARTBEAT;
      case "punch": return PUNCH;
      case "elastic": return ELASTIC;
      case "jelly": return JELLY;
      case "stamp": return stampTags(R);
      case "tiltswap": return tiltTags(w, R);
      case "flip": return FLIP;
      case "spin": return spinTags(R);
      case "swing": return swingTags(w, R);
      case "tada": return tadaTags(R);
      case "stretch": return STRETCH();
      case "ink": return INK;
      case "shimmer": case "scramble": return POPS;
      case "draw": return `${drawPending(activeColor(w))}\\t(198,360,\\1a${assAlpha(c.base)}\\3c${assColor(c.outline ?? "#000000")}\\bord${outlineW})`;
      case "flash": return `\\1c&HFFFFFF&\\t(0,280,\\1c${assColor(activeColor(w))})`;
      default: return "";
    }
  };

  const posTag = (w: PlacedWord) => `\\pos(${f1(w.x)},${f1(w.y)})`;

  /** The active window, split into segments where a motion needs \move (rise, bounce). */
  const activeSegments = (w: PlacedWord, R: number): Segment[] => {
    const s = w.activeStart;
    const e = w.activeEnd;
    const x = f1(w.x);
    const y = w.y;
    if (t.motion === "rise") {
      return [{ s, e, pos: `\\move(${x},${f1(y + 0.45 * em)},${x},${f1(y)},0,220)`, tags: "\\alpha&HFF&\\t(0,220,\\alpha&H00&)" }];
    }
    if (t.motion === "bounce") {
      const k = Math.min(1, (e - s) / 300);
      const t1 = s + 150 * k;
      const t2 = t1 + 75 * k;
      const t3 = t2 + 75 * k;
      const yy = (f: number) => f1(y + f * em);
      return [
        { s, e: t1, pos: `\\move(${x},${yy(-0.38)},${x},${yy(0.09)})`, tags: "\\fscx105\\fscy105" },
        { s: t1, e: t2, pos: `\\move(${x},${yy(0.09)},${x},${yy(-0.04)})`, tags: "" },
        { s: t2, e: t3, pos: `\\move(${x},${yy(-0.04)},${x},${yy(0)})`, tags: "" },
        { s: t3, e, pos: posTag(w), tags: "" },
      ].filter((g) => g.e - g.s >= 10);
    }
    if (t.motion === "drop") {
      // Falls from 1.5em above, squashes on landing, overshoots and settles.
      const k = Math.min(1, (e - s) / 360);
      const t1 = s + 200 * k;
      const t2 = t1 + 80 * k;
      const t3 = t2 + 80 * k;
      const yy = (f: number) => f1(y + f * em);
      const ms = (a: number, b: number) => Math.max(1, Math.round(b - a));
      return [
        { s, e: t1, pos: `\\move(${x},${yy(-1.5)},${x},${yy(0.06)})`, tags: `\\alpha&HFF&\\t(0,${ms(s, t1) >> 1},\\alpha&H00&)` },
        { s: t1, e: t2, pos: `\\move(${x},${yy(0.06)},${x},${yy(-0.05)})`, tags: `\\fscx116\\fscy80\\t(0,${ms(t1, t2)},\\fscx95\\fscy106)` },
        { s: t2, e: t3, pos: `\\move(${x},${yy(-0.05)},${x},${yy(0)})`, tags: `\\fscx95\\fscy106\\t(0,${ms(t2, t3)},\\fscx100\\fscy100)` },
        { s: t3, e, pos: posTag(w), tags: "" },
      ].filter((g) => g.e - g.s >= 10);
    }
    // A window just around the word, for reveals that slide in under a mask.
    const mask = `${f1(w.x - w.w / 2 - 0.2 * em)},${f1(y - 0.75 * em)},${f1(w.x + w.w / 2 + 0.2 * em)},${f1(y + 0.7 * em)}`;
    if (t.motion === "slidel") {
      return [{ s, e, pos: `\\move(${f1(w.x - 0.8 * w.w)},${f1(y)},${x},${f1(y)},0,200)`, tags: "\\fax0.32\\alpha&HFF&\\t(0,200,\\fax0\\alpha&H00&)" }];
    }
    if (t.motion === "extrude") {
      return [{ s, e, pos: `\\move(${x},${f1(y)},${f1(w.x - 0.06 * em)},${f1(y - 0.06 * em)},0,220)`, tags: "" }];
    }
    if (t.motion === "swipe") {
      const [x0, , x1, y1] = mask.split(",");
      return [{ s, e, pos: `\\move(${x},${f1(y + 0.35 * em)},${x},${f1(y)},0,240)`, tags: `\\clip(${x0},${y1},${x1},${y1})\\t(0,240,\\clip(${mask}))` }];
    }
    if (t.motion === "roll") {
      const k = Math.min(1, (e - s) / 240);
      const t1 = s + 180 * k;
      const t2 = s + 240 * k;
      return [
        { s, e: t1, pos: `\\move(${x},${f1(y + 0.8 * em)},${x},${f1(y - 0.06 * em)})`, tags: `\\clip(${mask})` },
        { s: t1, e: t2, pos: `\\move(${x},${f1(y - 0.06 * em)},${x},${f1(y)})`, tags: `\\clip(${mask})` },
        { s: t2, e, pos: posTag(w), tags: "" },
      ].filter((g) => g.e - g.s >= 10);
    }
    return [{ s, e, pos: posTag(w), tags: activeMotionTags(w, R) }];
  };

  const lineLevel = t.motion === "fade" || t.motion === "cut" || t.motion === "zoom" || t.motion === "emph";
  const reveal = ["stack", "rise", "blur", "type", "typestep", "cascade"].includes(t.motion);

  /** One letter of a word, for the letter motions (wave, cascade, rainbow). */
  const letterEvent = (s: number, e: number, w: PlacedWord, ch: string, pos: string, rot: string, colorHex: string, tags: string) =>
    ev(2, s, e, `\\an5${pos}${rot}\\fn${w.activeFace.fullName}\\fs${f1(w.activeFs)}\\b0\\i0\\fsp0${strokeTags}${shadowTags}\\1c${assColor(colorHex)}\\1a${assAlpha(c.base)}${tags}`, ch);

  /** Draws a spoken word letter by letter instead of as one text event. */
  const letterWord = (w: PlacedWord, rot: string, R: number, act: string) => {
    const s = w.activeStart;
    const e = w.activeEnd;
    const y = w.y;
    w.letters!.forEach(({ ch, dx }, i) => {
      if (!ch.trim()) return;
      const x = f1(w.x + dx);
      const col = c.letterColors?.length ? c.letterColors[i % c.letterColors.length] : act;
      if (t.motion === "cascade") {
        const d = i * 38;
        letterEvent(s, e, w, ch, `\\move(${x},${f1(y - 0.9 * em)},${x},${f1(y)},${d},${d + 260})`, rot, col, `\\frz${R + 24}\\alpha&HFF&\\t(${d},${d + 60},\\alpha&H00&)\\t(${d},${d + 260},\\frz${R})`);
      } else if (t.motion === "rainbow") {
        const d = i * 40;
        const peak = s + d + 144;
        letterEvent(s, Math.min(e, peak), w, ch, `\\move(${x},${f1(y)},${x},${f1(y - 0.3 * em)},${d},${d + 144})`, rot, col, `\\t(${d},${d + 144},\\fscx125\\fscy125)`);
        letterEvent(peak, e, w, ch, `\\move(${x},${f1(y - 0.3 * em)},${x},${f1(y)},0,176)`, rot, col, "\\fscx125\\fscy125\\t(0,176,\\fscx108\\fscy108)");
      } else {
        // wave: up and down on a 560 ms cycle, each letter 55 ms behind the last
        const d = i * 55;
        letterEvent(s, Math.min(e, s + d), w, ch, `\\pos(${x},${f1(y)})`, rot, col, "");
        for (let a = s + d, up = true; a < e; a += 280, up = !up) {
          const ya = f1(y - (up ? 0 : 0.24 * em)), yb = f1(y - (up ? 0.24 * em : 0));
          letterEvent(a, Math.min(e, a + 280), w, ch, `\\move(${x},${ya},${x},${yb})`, rot, col, "");
        }
      }
    });
  };

  for (const ch of layout.chunks) {
    const { tags: rot, frz: R } = rotTags(ch);
    const entry = t.motion === "fade" || t.motion === "emph" ? FADE : t.motion === "zoom" ? ZOOM : "";
    const containerEntry = t.motion === "fade" || t.motion === "emph" || t.motion === "zoom" ? FADE : "";
    const b = ch.block;
    line = { ch, R, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };

    // ── Containers ──────────────────────────────────────────────────────────
    if (t.container === "pill") {
      const px = 0.55 * em, py = 0.28 * em;
      const w = b.x1 - b.x0 + 2 * px, h = b.y1 - b.y0 + 2 * py;
      shapeEvent(0, ch.start, ch.end, 7, b.x0 - px, b.y0 - py, rot, roundedRect(w, h, h / 2), c.box ?? "#FFFFFF", containerEntry);
    } else if (t.container === "bar") {
      const py = 0.38 * em;
      shapeEvent(0, ch.start, ch.end, 7, 0, b.y0 - py, rot, roundedRect(W, b.y1 - b.y0 + 2 * py, 0), c.box ?? "#000000", containerEntry);
    } else if (t.container === "line") {
      for (const r of ch.lineRects) {
        const cy = (r.y0 + r.y1) / 2;
        shapeEvent(0, ch.start, ch.end, 7, r.x0 - 0.3 * em, cy - 0.66 * em, rot, roundedRect(r.x1 - r.x0 + 0.6 * em, 1.32 * em, 0.12 * em), c.box ?? "#FFFFFF", containerEntry);
      }
    } else if (t.container === "glass" && layout.panel) {
      const p = layout.panel;
      shapeEvent(0, ch.start, ch.end, 7, p.x, p.y, rot, roundedRect(p.w, p.h, 0.45 * em), c.box ?? "#0A100E80", containerEntry);
    } else if (t.container === "sticker") {
      const px = 0.35 * em, py = 0.2 * em, border = 0.12 * em;
      const w = b.x1 - b.x0 + 2 * px, h = b.y1 - b.y0 + 2 * py;
      shapeEvent(0, ch.start, ch.end, 7, b.x0 - px - border, b.y0 - py - border, rot, roundedRect(w + 2 * border, h + 2 * border, 0.28 * em + border), "#FFFFFF");
      shapeEvent(0, ch.start, ch.end, 7, b.x0 - px, b.y0 - py, rot, roundedRect(w, h, 0.28 * em), c.box ?? "#111111");
    } else if (t.container === "dark") {
      const px = 0.45 * em, py = 0.32 * em;
      const w = b.x1 - b.x0 + 2 * px, h = b.y1 - b.y0 + 2 * py;
      shapeEvent(0, ch.start, ch.end, 7, b.x0 - px, b.y0 - py, rot, roundedRect(w, h, 0), c.box ?? "#050908CC");
      shapeEvent(0, ch.start, ch.end, 7, b.x0 - px, b.y0 - py, rot, roundedRect(0.2 * em, h, 0), c.box2 ?? "#20D68A");
    }

    // ── Extras ──────────────────────────────────────────────────────────────
    if (t.extra === "quote") {
      const qFace = resolveFace("DM Serif Display", 400, false);
      ev(0, ch.start, ch.end, `\\an5\\pos(${f1(0.15 * W)},${f1(b.y0 - 0.95 * em)})\\fn${qFace.fullName}\\fs${f1(3.6 * em)}\\b0\\i0\\bord0\\shad0\\1c${assColor(accentHex)}${FADE}`, "“");
    }
    if (t.extra === "square") {
      const first = ch.words.find((w) => w.line === 0);
      if (first) shapeEvent(0, ch.start, ch.end, 5, ch.lineRects[0].x0 + 0.25 * em, first.y, rot, roundedRect(0.45 * em, 0.45 * em, 0), c.box ?? "#FF3B30");
    }
    if (t.extra === "bars" && opts.rms?.values.length) {
      const first = ch.words.find((w) => w.line === 0);
      if (first) {
        const { hz, values } = opts.rms;
        const sample = (ms: number) => values[Math.max(0, Math.min(values.length - 1, Math.round((ms / 1000) * hz)))] ?? 0;
        for (let i = 0; i < 4; i++) {
          const x = ch.lineRects[0].x0 + (0.08 + 0.15 * i) * em;
          let anim = `\\fscy${Math.round(30 + 70 * sample(ch.start + i * 30))}`;
          for (let tt = 100; tt < ch.end - ch.start && tt <= 6000; tt += 100) {
            anim += `\\t(${tt - 100},${tt},\\fscy${Math.round(30 + 70 * sample(ch.start + tt + i * 30))})`;
          }
          shapeEvent(0, ch.start, ch.end, 5, x, first.y, rot, roundedRect(0.1 * em, 0.8 * em, 0.05 * em), c.box2 ?? accentHex, anim);
        }
      }
    }

    // ── Symbols that belong to the line ───────────────────────────────────────
    if (sym) {
      const firstY = ch.words.find((w) => w.line === 0)?.y ?? line.cy;
      const lastLine = ch.lineRects.length - 1;
      const lastY = ch.words.filter((w) => w.line === lastLine).at(-1)?.y ?? firstY;
      const dur = ch.end - ch.start;
      if (sym.mode === "prefix") {
        symEvent(2, ch.start, ch.end, P(ch.lineRects[0].x0 + 0.42 * em, firstY), symGlyphs[0], symColor(0), em, "\\fscx20\\fscy20\\alpha&HFF&\\t(0,220,\\fscx100\\fscy100\\alpha&H00&)");
      } else if (sym.mode === "flank") {
        symEvent(2, ch.start, ch.end, P(ch.lineRects[0].x0 + 0.35 * em, firstY), symGlyphs[0], symColor(0), 0.7 * em, pulseTags(dur));
        symEvent(2, ch.start, ch.end, P(ch.lineRects[lastLine].x1 - 0.35 * em, lastY), symGlyphs[0], symColor(0), 0.7 * em, pulseTags(dur));
      } else if (sym.mode === "badge") {
        // A label in a box, top-left of the frame, popping in with each line.
        const px = 0.064 * Math.min(W, H);
        const labelW = symGlyphs.reduce((sum, g) => sum + measureText(/\s/.test(g) || hasGlyphs(labelFace, g) ? labelFace : symbolFace, g, px, 0.04), 0);
        const bw = labelW + 1.1 * px, bh = 1.64 * px;
        const bx = 0.07 * W + bw / 2, by = 0.08 * H + bh / 2;
        const pop = `\\org(${f1(bx)},${f1(by)})\\frz12\\fscx30\\fscy30\\alpha&HFF&\\t(0,300,\\frz3\\fscx100\\fscy100\\alpha&H00&)`;
        shapeEvent(0, ch.start, ch.end, 5, bx, by, "", roundedRect(bw, bh, 0.3 * px), symColor(0), pop);
        ev(2, ch.start, ch.end, `\\an5${P(bx, by)}\\b0\\i0\\fsp${f1(0.04 * px)}\\bord0\\shad0\\1c&HFFFFFF&${pop}`, glyphRun(sym.glyphs, labelFace, px));
      } else if (sym.mode === "stars") {
        // Five stars under the caption; one more fills in with each spoken word.
        const px = 0.8 * em;
        ch.words.forEach((w, k) => {
          const filled = Math.min(5, k + 1 + (ch.index % 2) * 2);
          const text = `{\\1c${assColor(symColor(0))}\\1a&H00&}${glyphRun("★".repeat(filled), labelFace, px)}{\\1c&HFFFFFF&\\1a&H80&}${glyphRun("★".repeat(5 - filled), labelFace, px)}`;
          ev(2, k === 0 ? ch.start : w.activeStart, ch.words[k + 1]?.activeStart ?? ch.end, `\\an5${P(line!.cx, b.y1 + 0.65 * em)}\\b0\\i0\\fsp${f1(0.08 * px)}\\bord${f1(0.05 * px)}\\3c&H000000&\\3a&H90&\\shad0`, text);
        });
      }
    }

    // ── Words ───────────────────────────────────────────────────────────────
    for (const w of ch.words) {
      const base = baseColor(w);
      const act = activeColor(w);

      // A boxed word sits on its own box for the whole chunk.
      if (w.style?.emphasis === "box") {
        const fill = w.style.color ?? accentHex;
        shapeEvent(1, ch.start, ch.end, 5, w.x, w.y + 0.02 * w.em, rot, roundedRect(w.w + 0.28 * w.em, 1.15 * w.em, 0.16 * w.em), fill, entry);
      }

      // Shapes that travel with the word (all states).
      const wordShape = (s: number, e: number, tags: string, pos?: string) => {
        if (t.motion === "bubble") {
          const fill = c.palette?.[w.index % c.palette.length] ?? "#FFFFFF";
          ev(1, s, e, `\\an5${pos ?? `\\pos(${f1(w.x)},${f1(w.y)})`}${rot}\\bord0\\shad0\\1c${assColor(fill)}\\1a${assAlpha(fill)}${tags}\\p1`, `${roundedRect(w.w + 0.68 * em, 1.18 * em, 0.59 * em)}{\\p0}`);
        } else if (t.motion === "blocks") {
          const fill = c.palette?.[w.index % c.palette.length] ?? "#FF3B30";
          ev(1, s, e, `\\an5${pos ?? `\\pos(${f1(w.x)},${f1(w.y)})`}${rot}\\bord0\\shad0\\1c${assColor(fill)}\\1a${assAlpha(fill)}${tags}\\p1`, `${roundedRect(w.w + 0.44 * em, 1.2 * em, 0.06 * em)}{\\p0}`);
        } else if (t.container === "wordbox") {
          ev(1, s, e, `\\an5${pos ?? `\\pos(${f1(w.x)},${f1(w.y)})`}${rot}\\bord0\\shad0\\1c${assColor(c.box ?? "#000000")}\\1a${assAlpha(c.box ?? "#000000")}${tags}\\p1`, `${roundedRect(w.w + 0.28 * em, 1.15 * em, 0)}{\\p0}`);
        }
      };

      if (t.motion === "karaoke") {
        textEvent(ch.start, ch.end, w, false, posTag(w), "", rot, base);
        const x0 = f1(w.x - w.w / 2 - 0.05 * em), x1 = f1(w.x + w.w / 2 + 0.05 * em);
        const y0 = f1(w.y - 0.7 * em), y1 = f1(w.y + 0.7 * em);
        const dur = Math.max(80, Math.round(w.activeEnd - w.activeStart));
        textEvent(w.activeStart, ch.end, w, false, posTag(w), `\\clip(${x0},${y0},${x0},${y1})\\t(0,${dur},\\clip(${x0},${y0},${x1},${y1}))`, rot, act);
        continue;
      }

      if (t.motion === "type" || t.motion === "typestep") {
        const x0 = w.x - w.w / 2 - 0.05 * em, x1 = w.x + w.w / 2 + 0.05 * em;
        const y0 = f1(w.y - 0.7 * em), y1 = f1(w.y + 0.7 * em);
        const dur = Math.max(80, Math.min(600, Math.round(w.activeEnd - w.activeStart - 30)));
        if (t.motion === "type") {
          textEvent(w.activeStart, ch.end, w, false, posTag(w), `\\clip(${f1(x0)},${y0},${f1(x0)},${y1})\\t(0,${dur},\\clip(${f1(x0)},${y0},${f1(x1)},${y1}))`, rot, base);
        } else {
          const steps = Math.max(2, Math.min(8, Array.from(w.text).length));
          for (let i = 1; i <= steps; i++) {
            const s = w.activeStart + ((i - 1) * dur) / steps;
            const e = i === steps ? ch.end : w.activeStart + (i * dur) / steps;
            const xr = x0 + ((x1 - x0) * i) / steps;
            textEvent(s, e, w, false, posTag(w), `\\clip(${f1(x0)},${y0},${f1(xr)},${y1})`, rot, base);
          }
        }
        if (t.extra === "cursor") {
          let blink = "";
          for (let k = 400; k < w.activeEnd - w.activeStart; k += 800) blink += `\\t(${k},${k + 1},\\alpha&HFF&)\\t(${k + 400},${k + 401},\\alpha&H00&)`;
          shapeEvent(2, w.activeStart, w.activeEnd, 4, w.x + w.w / 2 + 0.08 * em, w.y, rot, roundedRect(0.5 * em, 0.9 * em, 0), base, blink);
        }
        continue;
      }

      if (lineLevel) {
        const color = t.motion === "emph" && w.emphasis ? act : base;
        wordShape(ch.start, ch.end, entry);
        textEvent(ch.start, ch.end, w, false, posTag(w), entry, rot, color);
        continue;
      }

      // future
      if (!reveal) {
        const dimTags = t.motion === "dim" ? "\\alpha&HA6&" : t.motion === "draw" ? drawPending(act) : "";
        wordShape(ch.start, w.activeStart, dimTags);
        textEvent(ch.start, w.activeStart, w, false, posTag(w), dimTags, rot, base);
      }

      // A slow glow that breathes behind every word for the whole line.
      if (t.loop === "breathe") {
        const glow = c.glow ?? act;
        ev(1, ch.start, ch.end, `\\an5${posTag(w)}${rot}\\fn${w.face.fullName}\\fs${f1(w.fs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}\\1a&HFF&\\bord${f1(0.16 * em)}\\3c${assColor(glow)}\\blur${f1(0.3 * em)}\\shad0` +
          loopTags(ch.start, ch.end, 900, (ms) => `\\3a&H${Math.round(0x30 + 0x80 * (1 + tri(ms / 1800)) / 2).toString(16).toUpperCase().padStart(2, "0")}&`), w.text);
      }

      // active
      const letters = w.letters && LETTER_MOTIONS.includes(t.motion);
      if (letters) letterWord(w, rot, R, act);
      for (const seg of letters ? [] : activeSegments(w, R)) {
        wordShape(seg.s, seg.e, seg.tags, seg.pos);
        if (t.motion === "flash") {
          shapeEvent(1, seg.s, seg.e, 5, w.x, w.y + 0.02 * em, rot, roundedRect(w.w + 0.16 * em, 1.1 * em, 0.12 * em), "#FFFFFF", "\\blur3\\t(0,280,\\1a&HFF&)");
        }
        if (t.motion === "extrude") {
          const depth = c.extrude ?? c.outline ?? "#000000";
          for (let k = 4; k >= 1; k--) {
            ev(1, seg.s, seg.e, `\\an5${P(w.x - 0.06 * em + k * 0.03 * em, w.y - 0.06 * em + k * 0.03 * em)}${rot}\\fn${w.activeFace.fullName}\\fs${f1(w.activeFs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}\\bord0\\shad0\\1c${assColor(depth)}`, w.text);
          }
        }
        if (t.motion === "shimmer") {
          // A soft white band sweeps across the word every 900 ms.
          const bw = 0.36 * w.w, x0 = w.x - w.w / 2, y0 = f1(w.y - 0.7 * em), y1 = f1(w.y + 0.7 * em);
          for (let a = seg.s; a < seg.e; a += 900) {
            ev(3, a, Math.min(seg.e, a + 900), `\\an5${seg.pos}${rot}\\fn${w.activeFace.fullName}\\fs${f1(w.activeFs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}\\bord0\\shad0\\1c&HFFFFFF&\\1a&H40&\\clip(${f1(x0 - bw)},${y0},${f1(x0)},${y1})\\t(0,900,\\clip(${f1(x0 + w.w)},${y0},${f1(x0 + w.w + bw)},${y1}))`, w.text);
          }
        }
        if (t.motion === "slice") {
          // Two bands of the word jitter sideways in the second accent and cyan.
          const h = 1.12 * em, top = w.y - 0.56 * em;
          let flip = false;
          for (let s = seg.s; s < seg.e; s += 90) {
            const e = Math.min(seg.e, s + 90);
            const off = (flip ? -0.09 : 0.07) * em;
            flip = !flip;
            for (const [col, dx, b0, b1] of [[c.accent2 ?? "#FF2D55", off, 0.18, 0.42], ["#00E5FF", -off, 0.62, 0.88]] as const) {
              ev(3, s, e, `\\an5${P(w.x + dx, w.y)}${rot}\\fn${w.activeFace.fullName}\\fs${f1(w.activeFs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}\\bord0\\shad0\\1c${assColor(col)}\\clip(0,${f1(top + b0 * h)},${W},${f1(top + b1 * h)})`, w.text);
            }
          }
        }
        if (t.motion === "scramble") {
          // Random characters settle into the word (same glyphs as the preview).
          for (let step = 0; step < SCRAMBLE_STEPS && seg.s + step * SCRAMBLE_STEP_MS < seg.e; step++) {
            const a = seg.s + step * SCRAMBLE_STEP_MS;
            textEvent(a, Math.min(seg.e, a + SCRAMBLE_STEP_MS), { ...w, text: scrambledWord(w.text, w.index, step) }, true, seg.pos, "", rot, act);
          }
          textEvent(Math.min(seg.e, seg.s + SCRAMBLE_STEPS * SCRAMBLE_STEP_MS), seg.e, w, true, seg.pos, seg.tags, rot, act);
          continue;
        }
        if (t.motion === "boxword") {
          const fill = boxColor(w, "#FF2D2D");
          const pill = t.wordBox === "pill";
          const bw = w.w + (pill ? 0.6 : 0.24) * em, bh = 1.12 * em;
          ev(1, seg.s, seg.e, `\\an5\\pos(${f1(w.x)},${f1(w.y + 0.02 * em)})${rot}\\bord0\\shad0\\1c${assColor(fill)}\\1a${assAlpha(fill)}${seg.tags}\\p1`, `${roundedRect(bw, bh, pill ? bh / 2 : 0.16 * em)}{\\p0}`);
        }
        if (t.motion === "marker") {
          shapeEvent(1, seg.s, seg.e, 4, w.x - w.w / 2 - 0.14 * em, w.y + 0.05 * em, rot, skewRect(w.w + 0.28 * em, 0.78 * em, 0.12 * em), boxColor(w, "#FFE14D"), "\\fscx0\\t(0,180,\\fscx100)");
        }
        if (t.motion === "stamp") {
          // The stamp's frame: an outlined (unfilled) box in the word's colour, moving with it.
          ev(1, seg.s, seg.e, `\\an5${seg.pos}${rot}\\bord${f1(0.07 * em)}\\3c${assColor(act)}\\3a${assAlpha(act)}\\1a&HFF&\\shad0${seg.tags}\\p1`, `${roundedRect(w.w + 0.24 * em, 1.08 * em, 0.14 * em)}{\\p0}`);
        }
        if (t.motion === "underline") {
          shapeEvent(1, seg.s, seg.e, 4, w.x - w.w / 2, w.y + 0.5 * em, rot, roundedRect(w.w, 0.12 * em, 0.06 * em), c.box ?? "#20D68A", "\\fscx0\\t(0,200,\\fscx100)");
        }
        if (t.motion === "glow") {
          const glow = c.glow ?? act;
          ev(1, seg.s, seg.e, `\\an5${seg.pos}${rot}\\fn${w.face.fullName}\\fs${f1(w.fs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}\\1a&HFF&\\bord${f1(0.18 * em)}\\3c${assColor(glow)}\\3a&HFF&\\blur${f1(0.3 * em)}\\shad0\\t(0,160,\\3a&H00&)\\t(160,320,\\3a&H40&)`, w.text);
        }
        if (t.motion === "rgb") {
          let flip = false;
          for (let s = seg.s; s < seg.e; s += 70) {
            const e = Math.min(seg.e, s + 70);
            const off = (flip ? 0.11 : 0.07) * em;
            flip = !flip;
            for (const [col, dx, dy] of [["#FF2A55", -off, 0.02 * em], ["#00E5FF", off, -0.02 * em]] as const) {
              ev(1, s, e, `\\an5\\pos(${f1(w.x + dx)},${f1(w.y + dy)})${rot}\\fn${w.face.fullName}\\fs${f1(w.fs)}\\b0\\i0\\bord0\\shad0\\1c${assColor(col)}\\1a&H40&`, w.text);
            }
          }
        }
        const noStroke = t.motion === "marker" || t.motion === "boxword";
        const wordShake = w.style?.emphasis === "shake" && t.motion !== "shake" ? shakeTags(R) : "";
        textEvent(seg.s, seg.e, w, true, seg.pos, (noStroke ? "\\bord0" : "") + seg.tags + wordShake, rot, t.motion === "bubble" || t.motion === "blocks" ? base : act);
      }

      // past (a tilt-swapped word keeps its lean)
      const pastTags = t.motion === "dim" ? "\\alpha&HA6&" : t.motion === "tiltswap" ? `\\frz${R - tiltOf(w)}` : "";
      wordShape(w.activeEnd, ch.end, pastTags);
      textEvent(w.activeEnd, ch.end, w, false, posTag(w), pastTags, rot, base);

      // Symbols that follow the spoken word.
      if (sym) {
        const s = w.activeStart, e = w.activeEnd;
        const left = w.x - w.w / 2, top = w.y - 0.56 * em;
        if (sym.mode === "sparkle") {
          [[-0.18, -0.3], [0.96, -0.38], [1.04, 0.62]].forEach(([px, py], k) => {
            const d = k * 70;
            symEvent(3, s, e, P(left + px * w.w, top + py * 1.12 * em), symGlyphs[k % symGlyphs.length], symColor(k), 0.42 * em,
              `\\fscx0\\fscy0\\frz90\\t(${d},${d + 260},\\fscx130\\fscy130\\frz-20)\\t(${d + 260},${d + 520},\\fscx90\\fscy90\\frz0)`);
          });
        } else if (sym.mode === "orbit") {
          // Clockwise from 3 o'clock, one turn per 1.1 s, as eight straight hops.
          const r = 0.68 * em, step = 1100 / 8;
          const at = (ms: number) => { const a = (2 * Math.PI * ms) / 1100; return [w.x + r * Math.cos(a), w.y + r * Math.sin(a)]; };
          for (let a = s; a < e; a += step) {
            const [x0, y0] = at(a - s), [x1, y1] = at(Math.min(e, a + step) - s);
            symEvent(3, a, Math.min(e, a + step), `\\move(${f1(x0)},${f1(y0)},${f1(x1)},${f1(y1)})`, symGlyphs[0], symColor(0), 0.45 * em);
          }
        } else if (sym.mode === "arrow") {
          const xa = left - 0.36 * em;
          symEvent(3, s, e, `\\move(${f1(xa - 0.25 * em)},${f1(w.y)},${f1(xa)},${f1(w.y)},0,220)`, symGlyphs[0], symColor(0), 0.7 * em, "\\alpha&HFF&\\t(0,220,\\alpha&H00&)");
        } else if (sym.mode === "confetti" && (w.emphasis || w.emoji)) {
          for (let k = 0; k < 9; k++) {
            const ang = (k / 9) * 2 * Math.PI - Math.PI / 2, r = (1.6 + (k % 3) * 0.35) * 0.38 * em;
            symEvent(3, s, s + 640, `\\move(${f1(w.x)},${f1(w.y)},${f1(w.x + Math.cos(ang) * r)},${f1(w.y + Math.sin(ang) * r * 0.8)},0,640)`, symGlyphs[k % symGlyphs.length], symColor(k), 0.38 * em,
              "\\fscx30\\fscy30\\t(0,190,\\fscx100\\fscy100)\\t(190,640,\\fscx110\\fscy110\\alpha&HFF&)");
          }
        }
      }

      // Emoji overlays.
      if (w.emoji) {
        const file = emojiAssetName(w.emoji);
        const s = w.activeStart / 1000;
        if (w.emojiMode === "above") {
          const size = Math.round(1.05 * em);
          emoji.push({ file, size, x: Math.round(w.x - size / 2), y: Math.round(w.y - 0.6 * em - size), start: s, end: w.activeEnd / 1000 });
        } else if (w.emojiMode === "end") {
          const size = Math.round(0.95 * em);
          emoji.push({ file, size, x: Math.round(w.x + w.w / 2 + 0.1 * em), y: Math.round(w.y - size / 2), start: s, end: ch.end / 1000 });
        } else if (w.emojiMode === "burst") {
          const size = Math.round(0.6 * em);
          for (const [dx, dy] of [[-1.4, -1.75], [1.5, -1.5], [0, -2.4], [-1.75, 0.25], [1.75, 0.4]]) {
            emoji.push({ file, size, x: Math.round(w.x - size / 2), y: Math.round(w.y - size / 2), start: s, end: s + 0.52, vx: (dx * em) / 0.52, vy: (dy * em) / 0.52 });
          }
        } else if (w.emojiMode === "sticker") {
          // A big emoji on a white disc in the top-right corner, until the next one.
          const size = Math.round(0.22 * Math.min(W, H));
          const x = Math.round(W - 0.09 * W - size), y = Math.round(0.13 * H);
          const later = ch.words.find((o) => o.activeStart > w.activeStart && o.emoji);
          const endMs = later ? later.activeStart : ch.end;
          const d = size * 1.18;
          const slap = "\\fscx220\\fscy220\\alpha&HFF&\\t(0,320,\\fscx100\\fscy100\\alpha&H00&)";
          shapeEvent(0, w.activeStart, endMs, 5, x + size / 2, y + size / 2 + 0.05 * d, "", roundedRect(d, d, d / 2), "#00000059", `\\blur${f1(0.06 * d)}${slap}`);
          shapeEvent(0, w.activeStart, endMs, 5, x + size / 2, y + size / 2, "", roundedRect(d, d, d / 2), "#FFFFFF", slap);
          emoji.push({ file, size, x, y, start: s, end: endMs / 1000 });
        } else if (w.emojiMode === "flank") {
          const size = Math.round(0.7 * em);
          const y = Math.round(w.y - size / 2);
          emoji.push({ file, size, x: Math.round(w.x - w.w / 2 - 0.1 * em - size), y, start: s, end: w.activeEnd / 1000 });
          emoji.push({ file, size, x: Math.round(w.x + w.w / 2 + 0.1 * em), y, start: s, end: w.activeEnd / 1000 });
        } else if (w.emojiMode === "orbit") {
          const size = Math.round(0.55 * em);
          emoji.push({ file, size, x: Math.round(w.x), y: Math.round(w.y), start: s, end: w.activeEnd / 1000, orbit: { cx: w.x, cy: w.y, r: 0.83 * em, period: 1.1 } });
        } else if (w.emojiMode === "rain") {
          const size = Math.round(0.09 * W);
          for (let k = 0; k < 5; k++) {
            const delay = k * 0.09;
            emoji.push({ file, size, x: Math.round((0.08 + k * 0.18 + (k % 2 ? 0.04 : -0.02)) * W), y: Math.round(-0.12 * H), start: s + delay, end: s + delay + 1.1, vx: 0, vy: (0.72 * H) / 1.1 });
          }
        }
      }
    }
  }

  line = null;

  // Full-length extras.
  const lastEnd = layout.chunks.length ? layout.chunks[layout.chunks.length - 1].end : 0;
  if (t.extra === "letterbox") {
    const end = Math.max(opts.durationMs ?? 0, lastEnd);
    shapeEvent(0, 0, end, 7, 0, 0, "", roundedRect(W, 0.13 * H, 0), "#000000");
    shapeEvent(0, 0, end, 7, 0, H - 0.13 * H, "", roundedRect(W, 0.13 * H, 0), "#000000");
  }

  let glass: GlassPlan | null = null;
  if (layout.panel && layout.chunks.length) {
    const windows: [number, number][] = [];
    for (const ch of layout.chunks) {
      const s = ch.start / 1000, e = ch.end / 1000;
      const last = windows[windows.length - 1];
      if (last && s - last[1] < 1.5) last[1] = Math.max(last[1], e);
      else windows.push([s, e]);
    }
    glass = { ...layout.panel, windows };
  }

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Inter,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  return { ass: `${header}\n${events.join("\n")}\n`, emoji, glass, layout };
}
