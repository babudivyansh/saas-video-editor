// Caption layout: chunk words, measure them with the real font file, wrap
// lines and place every word. The ASS writer pins each word at the position
// computed here, which is what lets boxes, highlighters, underlines, emoji
// and the glass panel line up exactly with the text.
//
// Sizes follow the browser preview (CaptionTemplateRender): one em is 9% of
// the frame's short side times the template's size, so a template looks the
// same in the picker and in the export.

import type { CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import {
  DEVANAGARI_FALLBACK,
  DEVANAGARI_RE,
  assFontSize,
  hasGlyphs,
  measureText,
  resolveFace,
  type FontFace,
} from "./fonts";

export interface EngineWord {
  word: string;
  /** ms */
  start: number;
  /** ms */
  end: number;
  speaker?: string;
}

export interface PlacedWord {
  /** Index into the clip's word list. */
  index: number;
  text: string;
  /** When this word is the spoken one (ms). */
  activeStart: number;
  activeEnd: number;
  face: FontFace;
  fs: number;
  /** Face/size used while active (bold, font switch); same as face when unchanged. */
  activeFace: FontFace;
  activeFs: number;
  emphasis: boolean;
  /** 0-based speaker order; 0 when unknown. */
  speaker: number;
  emoji: string | null;
  /** Centre of the word's text. */
  x: number;
  y: number;
  /** Text width (px), excluding any reserved emoji space. */
  w: number;
  line: number;
}

export interface PlacedChunk {
  index: number;
  start: number;
  end: number;
  words: PlacedWord[];
  /** Block bounds around all lines (text only, no container padding). */
  block: { x0: number; y0: number; x1: number; y1: number };
  lineRects: { x0: number; y0: number; x1: number; y1: number }[];
  /** Rotation in CSS degrees (positive = clockwise), around the block centre. */
  rotation: number;
}

export interface CaptionLayout {
  W: number;
  H: number;
  emPx: number;
  trackingPx: number;
  lineHeight: number;
  chunks: PlacedChunk[];
  /** Glass only: one fixed panel for the whole clip, so one blur node covers it. */
  panel: { x: number; y: number; w: number; h: number } | null;
}

export interface LayoutOptions {
  words: EngineWord[];
  template: CaptionTemplateSpec;
  W: number;
  H: number;
  sizeScale?: number;
  /** Block centre as a percentage of frame height; overrides the template placement. */
  positionY?: number | null;
  emphasis?: number[];
  emoji?: Record<number, string>;
  wordsPerSec?: number;
}

const STICKER_TILTS = [-4, 3, -2, 4];

/**
 * Extra width (fraction of the word) reserved for motions that scale the
 * spoken word up, so it doesn't collide with its neighbours at full size.
 * The settled scale matters most: pop ends at 110%, soft pop at 105%.
 */
const SCALE_RESERVE: Partial<Record<CaptionTemplateSpec["motion"], number>> = {
  pop: 0.14, stack: 0.14, split: 0.14, bubble: 0.1, step: 0.12, shake: 0.1, slam: 0.06, blocks: 0.06,
  pops: 0.07, boxword: 0.07, dim: 0.07, hollow: 0.07, fontswitch: 0.07, wobble: 0.06, bounce: 0.06,
};

function applyCase(text: string, c: CaptionTemplateSpec["type"]["case"]): string {
  if (c === "upper") return text.toLocaleUpperCase();
  if (c === "lower") return text.toLocaleLowerCase();
  return text;
}

/** Splits words into on-screen chunks, also breaking at long pauses. */
function chunkWords(words: EngineWord[], perChunk: number): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const prev = words[i - 1];
    const pause = prev ? words[i].start - prev.end : 0;
    if (cur.length && (cur.length >= perChunk || pause > 700)) {
      out.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function layoutCaptions(opts: LayoutOptions): CaptionLayout {
  const { words, template: t, W, H } = opts;
  const emPx = 0.09 * Math.min(W, H) * t.type.size * (opts.sizeScale ?? 1);
  const trackingPx = (t.type.tracking ?? 0) * emPx;
  const lineFactor = t.container === "line" ? 1.6 : t.motion === "bubble" || t.motion === "blocks" ? 1.3 : 1.12;
  const lineHeight = lineFactor * emPx;
  const emphasisSet = new Set(opts.emphasis ?? []);
  const emojiMode = t.emoji;

  // Fast talkers get one word fewer on screen, never fewer than one.
  const perChunk = Math.max(1, (opts.wordsPerSec ?? 0) > 3.5 && t.words >= 4 ? t.words - 1 : t.words);

  const baseFace = resolveFace(t.type.font, t.type.weight, !!t.type.italic);
  const fallbackFace = resolveFace(DEVANAGARI_FALLBACK.family, DEVANAGARI_FALLBACK.weight, false);
  const speakerOrder = new Map<string, number>();

  const align = t.placement.align;
  const marginL = align === "left" ? 0.08 * W : 0.06 * W;
  const marginR = align === "left" ? 0.1 * W : 0.06 * W;
  const maxLineW = W - marginL - marginR;
  const gap = t.motion === "bubble" ? 0.16 * emPx : 0.28 * emPx;
  const wordPad = t.motion === "bubble" ? 0.68 * emPx : t.motion === "blocks" ? 0.44 * emPx : t.container === "wordbox" ? 0.28 * emPx : 0;
  const lead = t.extra === "square" || t.extra === "bars" ? 0.7 * emPx : 0;

  const groups = chunkWords(words, perChunk);
  const chunks: PlacedChunk[] = [];

  groups.forEach((idxs, ci) => {
    const first = words[idxs[0]];
    const last = words[idxs[idxs.length - 1]];
    const nextStart = groups[ci + 1] ? words[groups[ci + 1][0]].start : Infinity;
    const start = Math.max(0, first.start);
    let end = Math.min(nextStart, last.end + 600);
    if (nextStart - last.end < 250) end = nextStart;
    if (!Number.isFinite(end) || end <= start) end = start + Math.max(300, last.end - start);

    // Measure.
    const items = idxs.map((wi, k) => {
      const src = words[wi];
      const text = applyCase(src.word, t.type.case);
      const emphasis = emphasisSet.has(wi);
      let face = baseFace;
      if (t.motion === "emph" && emphasis) face = resolveFace(t.type.font, t.type.weight, true);
      if (DEVANAGARI_RE.test(text) && !hasGlyphs(face, text)) face = fallbackFace;
      let activeFace = face;
      let activeEm = emPx;
      if (t.motion === "bold") activeFace = resolveFace(face.family, 800, face.italic);
      if (t.motion === "fontswitch") {
        activeFace = resolveFace("Instrument Serif", 400, true);
        activeEm = emPx * 1.2;
      }
      const w = Math.max(
        measureText(face, text, emPx, t.type.tracking ?? 0),
        measureText(activeFace, text, activeEm, activeFace === face ? t.type.tracking ?? 0 : 0),
      );
      const emoji = emojiMode !== "none" ? opts.emoji?.[wi] ?? null : null;
      const reserve = emoji && emojiMode === "end" ? 1.05 * emPx : 0;
      let speaker = 0;
      if (src.speaker) {
        if (!speakerOrder.has(src.speaker)) speakerOrder.set(src.speaker, speakerOrder.size);
        speaker = speakerOrder.get(src.speaker)!;
      }
      const nextInChunk = idxs[k + 1] !== undefined ? words[idxs[k + 1]].start : end;
      const activeStart = Math.max(start, src.start);
      const activeEnd = Math.max(activeStart + 40, Math.min(end, nextInChunk));
      return {
        index: wi, text, emphasis, face, activeFace, activeEm, emoji, speaker,
        activeStart, activeEnd,
        boxW: w * (1 + (SCALE_RESERVE[t.motion] ?? 0)) + wordPad, textW: w, reserve,
      };
    });

    // Wrap greedily.
    const lines: (typeof items)[] = [];
    let cur: typeof items = [];
    let curW = lead;
    for (const it of items) {
      const add = (cur.length ? gap : 0) + it.boxW + it.reserve;
      if (cur.length && curW + add > maxLineW) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      curW += (cur.length ? gap : 0) + it.boxW + it.reserve;
      cur.push(it);
    }
    if (cur.length) lines.push(cur);

    const blockH = lines.length * lineHeight;
    let cy: number;
    if (opts.positionY != null && Number.isFinite(opts.positionY)) cy = (opts.positionY / 100) * H;
    else if (t.placement.y === "low") cy = 0.77 * H - blockH / 2;
    else if (t.placement.y === "high") cy = 0.2 * H + blockH / 2;
    else cy = 0.5 * H;
    // Keep clear of the top edge and the platform UI along the bottom.
    cy = Math.min(Math.max(cy, 0.08 * H + blockH / 2), 0.8 * H - blockH / 2);

    const placed: PlacedWord[] = [];
    const lineRects: PlacedChunk["lineRects"] = [];
    let bx0 = Infinity;
    let bx1 = -Infinity;
    lines.forEach((line, li) => {
      const lineW = (li === 0 ? lead : 0) + line.reduce((s, it, k) => s + (k ? gap : 0) + it.boxW + it.reserve, 0);
      let x = align === "left" ? marginL : (W - lineW) / 2;
      const lx0 = x;
      if (li === 0) x += lead;
      const y = cy - blockH / 2 + lineHeight * (li + 0.5);
      for (const it of line) {
        placed.push({
          index: it.index,
          text: it.text,
          activeStart: it.activeStart,
          activeEnd: it.activeEnd,
          face: it.face,
          fs: assFontSize(it.face, emPx),
          activeFace: it.activeFace,
          activeFs: assFontSize(it.activeFace, it.activeEm),
          emphasis: it.emphasis,
          speaker: it.speaker,
          emoji: it.emoji,
          x: x + it.boxW / 2,
          y,
          w: it.textW,
          line: li,
        });
        x += it.boxW + it.reserve + gap;
      }
      lineRects.push({ x0: lx0, y0: y - lineHeight / 2, x1: lx0 + lineW, y1: y + lineHeight / 2 });
      bx0 = Math.min(bx0, lx0);
      bx1 = Math.max(bx1, lx0 + lineW);
    });

    const rotation = (t.placement.tilt ?? 0) + (t.container === "sticker" ? STICKER_TILTS[ci % STICKER_TILTS.length] : 0);
    chunks.push({
      index: ci,
      start,
      end,
      words: placed,
      block: { x0: bx0, y0: cy - blockH / 2, x1: bx1, y1: cy + blockH / 2 },
      lineRects,
      rotation,
    });
  });

  let panel: CaptionLayout["panel"] = null;
  if (t.container === "glass" && chunks.length) {
    // One panel for the whole clip: as wide as the widest chunk, as tall as
    // the tallest, centred on the placement. Every chunk is re-centred in it.
    const padX = 0.4 * emPx;
    const padY = 0.3 * emPx;
    const maxW = Math.max(...chunks.map((c) => c.block.x1 - c.block.x0));
    const maxH = Math.max(...chunks.map((c) => c.block.y1 - c.block.y0));
    let cyPanel: number;
    if (opts.positionY != null && Number.isFinite(opts.positionY)) cyPanel = (opts.positionY / 100) * H;
    else if (t.placement.y === "low") cyPanel = 0.77 * H - maxH / 2;
    else if (t.placement.y === "high") cyPanel = 0.2 * H + maxH / 2;
    else cyPanel = 0.5 * H;
    cyPanel = Math.min(Math.max(cyPanel, 0.08 * H + maxH / 2), 0.8 * H - maxH / 2);
    for (const c of chunks) {
      const dy = cyPanel - (c.block.y0 + c.block.y1) / 2;
      c.block = { ...c.block, y0: c.block.y0 + dy, y1: c.block.y1 + dy };
      c.lineRects = c.lineRects.map((r) => ({ ...r, y0: r.y0 + dy, y1: r.y1 + dy }));
      for (const w of c.words) w.y += dy;
    }
    panel = {
      x: Math.round((W - maxW) / 2 - padX),
      y: Math.round(cyPanel - maxH / 2 - padY),
      w: Math.round(maxW + 2 * padX),
      h: Math.round(maxH + 2 * padY),
    };
  }

  return { W, H, emPx, trackingPx, lineHeight, chunks, panel };
}
