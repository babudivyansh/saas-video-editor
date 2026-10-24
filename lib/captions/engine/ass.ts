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

import type { CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { emojiAssetName } from "@clipiro/shared/caption-emoji";
import { resolveFace } from "./fonts";
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

type Segment = { s: number; e: number; pos: string; tags: string };

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

  const ev = (layer: number, s: number, e: number, tags: string, text: string) => {
    if (e - s < 10) return;
    events.push(`Dialogue: ${layer},${assTime(s)},${assTime(e)},Default,,0,0,0,,{${tags}}${text}`);
  };

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
  const shadowTags = c.hardShadow
    ? `\\xshad${f1(0.08 * em)}\\yshad${f1(0.1 * em)}\\4c${assColor(c.hardShadow)}\\4a${assAlpha(c.hardShadow)}`
    : "\\shad0";

  const baseColor = (w: PlacedWord) => (c.speakers?.length ? c.speakers[w.speaker % c.speakers.length] : c.base);
  const activeColor = (w: PlacedWord) => (c.cycle?.length ? c.cycle[w.index % c.cycle.length] : accentHex);

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
    const common = `\\an5${pos}${rot}\\fn${face.fullName}\\fs${f1(fs)}\\b0\\i0\\fsp${f1(layout.trackingPx)}${strokeTags}${shadowTags}\\1a${t.motion === "hollow" ? "&HFF&" : fillAlpha}`;
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
    return [{ s, e, pos: posTag(w), tags: activeMotionTags(w, R) }];
  };

  const lineLevel = t.motion === "fade" || t.motion === "cut" || t.motion === "zoom" || t.motion === "emph";
  const reveal = ["stack", "rise", "blur", "type", "typestep"].includes(t.motion);

  for (const ch of layout.chunks) {
    const { tags: rot, frz: R } = rotTags(ch);
    const entry = t.motion === "fade" || t.motion === "emph" ? FADE : t.motion === "zoom" ? ZOOM : "";
    const containerEntry = t.motion === "fade" || t.motion === "emph" || t.motion === "zoom" ? FADE : "";

    // ── Containers ──────────────────────────────────────────────────────────
    const b = ch.block;
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

    // ── Words ───────────────────────────────────────────────────────────────
    for (const w of ch.words) {
      const base = baseColor(w);
      const act = activeColor(w);

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
        const dimTags = t.motion === "dim" ? "\\alpha&HA6&" : "";
        wordShape(ch.start, w.activeStart, dimTags);
        textEvent(ch.start, w.activeStart, w, false, posTag(w), dimTags, rot, base);
      }

      // active
      for (const seg of activeSegments(w, R)) {
        wordShape(seg.s, seg.e, seg.tags, seg.pos);
        if (t.motion === "boxword") {
          ev(1, seg.s, seg.e, `\\an5\\pos(${f1(w.x)},${f1(w.y + 0.02 * em)})${rot}\\bord0\\shad0\\1c${assColor(c.box ?? "#FF2D2D")}\\1a${assAlpha(c.box ?? "#FF2D2D")}${seg.tags}\\p1`, `${roundedRect(w.w + 0.24 * em, 1.12 * em, 0.16 * em)}{\\p0}`);
        }
        if (t.motion === "marker") {
          shapeEvent(1, seg.s, seg.e, 4, w.x - w.w / 2 - 0.14 * em, w.y + 0.05 * em, rot, skewRect(w.w + 0.28 * em, 0.78 * em, 0.12 * em), c.box ?? "#FFE14D", "\\fscx0\\t(0,180,\\fscx100)");
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
        textEvent(seg.s, seg.e, w, true, seg.pos, (noStroke ? "\\bord0" : "") + seg.tags, rot, t.motion === "bubble" || t.motion === "blocks" ? base : act);
      }

      // past
      const pastTags = t.motion === "dim" ? "\\alpha&HA6&" : "";
      wordShape(w.activeEnd, ch.end, pastTags);
      textEvent(w.activeEnd, ch.end, w, false, posTag(w), pastTags, rot, base);

      // Emoji overlays.
      if (w.emoji) {
        const file = emojiAssetName(w.emoji);
        const s = w.activeStart / 1000;
        if (t.emoji === "above") {
          const size = Math.round(1.05 * em);
          emoji.push({ file, size, x: Math.round(w.x - size / 2), y: Math.round(w.y - 0.6 * em - size), start: s, end: w.activeEnd / 1000 });
        } else if (t.emoji === "end") {
          const size = Math.round(0.95 * em);
          emoji.push({ file, size, x: Math.round(w.x + w.w / 2 + 0.1 * em), y: Math.round(w.y - size / 2), start: s, end: ch.end / 1000 });
        } else if (t.emoji === "burst") {
          const size = Math.round(0.6 * em);
          for (const [dx, dy] of [[-1.4, -1.75], [1.5, -1.5], [0, -2.4], [-1.75, 0.25], [1.75, 0.4]]) {
            emoji.push({ file, size, x: Math.round(w.x - size / 2), y: Math.round(w.y - size / 2), start: s, end: s + 0.52, vx: (dx * em) / 0.52, vy: (dy * em) / 0.52 });
          }
        } else if (t.emoji === "rain") {
          const size = Math.round(0.09 * W);
          for (let k = 0; k < 5; k++) {
            const delay = k * 0.09;
            emoji.push({ file, size, x: Math.round((0.08 + k * 0.18 + (k % 2 ? 0.04 : -0.02)) * W), y: Math.round(-0.12 * H), start: s + delay, end: s + delay + 1.1, vx: 0, vy: (0.72 * H) / 1.1 });
          }
        }
      }
    }
  }

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
