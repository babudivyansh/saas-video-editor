"use client";

// Draws one caption template at one moment in time, in the browser.
//
// Time-driven on purpose: the pickers feed it a looping demo clock, the editor
// feeds it the playhead, and both get the same chunking, active word, emoji
// and motion as the export (lib/captions/engine). The motions themselves are
// CSS (CaptionTemplateRender.module.css), started by the class change when a
// word becomes the spoken one.

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { LETTER_MOTIONS, SCRAMBLE_STEPS, SCRAMBLE_STEP_MS, scrambledWord, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { BIGGER_SCALE, type CaptionWordStyle } from "@clipiro/shared/caption-style";
import s from "./CaptionTemplateRender.module.css";

export interface PreviewWord {
  text: string;
  /** ms */
  start: number;
  /** ms */
  end: number;
  emoji?: string | null;
  emphasis?: boolean;
  speaker?: number;
  /** The user's own look for this word; the export draws the same (lib/captions/engine). */
  style?: CaptionWordStyle;
}

/** Motions with no per-word active state, where a word's shake can't show (as in the export). */
const NO_WORD_ACTIVE = new Set(["karaoke", "type", "typestep", "fade", "cut", "zoom", "emph"]);
const BOX_TEXT = "#0A0A0A";

export interface CaptionTemplateRenderProps {
  template: CaptionTemplateSpec;
  words: PreviewWord[];
  /** Current time in ms, on the same clock as the words. */
  timeMs: number;
  /** Paint the family's stand-in footage behind the caption. Off when drawn over real video. */
  scene?: boolean;
  showSafeZone?: boolean;
  /** Fill the parent instead of keeping a 9:16 box (the editor canvas). */
  fill?: boolean;
  accent?: string | null;
  sizeScale?: number;
  /** Block centre, % of frame height. */
  positionY?: number | null;
  /** Block centre, % of frame width; the block is kept inside the frame's margins. */
  positionX?: number | null;
  className?: string;
}

/** Side margins a block stays inside, as a fraction of the frame (engine/layout.ts marginL/marginR). */
const SIDE_MARGIN = 0.06;

const STICKER_TILTS = [-4, 3, -2, 4];
/** Sparkle glyph positions, as fractions of the word's box (same as engine/ass.ts). */
const SPARKLES = [[-0.18, -0.3], [0.96, -0.38], [1.04, 0.62]];

/** CSS text-shadow approximating an outline of `width` (0-4 scale). */
function outlineShadow(color: string | undefined, width: number | undefined, hard?: string): string {
  if (!color || !width) return hard ? `.07em .09em 0 ${hard}` : "0 .05em .25em rgba(0,0,0,.45)";
  const o = `${(width * 0.016).toFixed(3)}em`;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  const parts = dirs.map(([x, y]) => `calc(${o} * ${x}) calc(${o} * ${y}) 0 ${color}`);
  if (hard) parts.push(`.08em .1em 0 ${hard}`);
  return parts.join(",");
}

interface Chunk {
  index: number;
  start: number;
  end: number;
  words: (PreviewWord & { i: number })[];
}

/** Same chunking rule as lib/captions/engine/layout.ts chunkWords. */
export function chunkPreviewWords(words: PreviewWord[], perChunk: number): Chunk[] {
  const out: Chunk[] = [];
  let cur: (PreviewWord & { i: number })[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= perChunk || (prev && w.start - prev.end > 700))) {
      out.push({ index: out.length, start: cur[0].start, end: 0, words: cur });
      cur = [];
    }
    cur.push({ ...w, i });
  });
  if (cur.length) out.push({ index: out.length, start: cur[0].start, end: 0, words: cur });
  out.forEach((c, k) => {
    const last = c.words[c.words.length - 1];
    const next = out[k + 1]?.start ?? Infinity;
    c.end = next - last.end < 250 ? next : Math.min(next, last.end + 600);
  });
  return out;
}

export default function CaptionTemplateRender({
  template: t,
  words,
  timeMs,
  scene = true,
  showSafeZone,
  fill,
  accent,
  sizeScale = 1,
  positionY,
  positionX,
  className,
}: CaptionTemplateRenderProps) {
  const capRef = useRef<HTMLDivElement>(null);
  // A dragged block is centred on positionX, then pushed back inside the
  // margins once its width is known — the same clamp the export applies.
  useLayoutEffect(() => {
    const el = capRef.current;
    const frame = el?.parentElement;
    if (!el || !frame || positionX == null) return;
    const fw = frame.clientWidth;
    const half = el.offsetWidth / 2;
    const cx = Math.min(Math.max((positionX / 100) * fw, SIDE_MARGIN * fw + half), (1 - SIDE_MARGIN) * fw - half);
    el.style.setProperty("--px", `${cx}px`);
  });
  const chunks = chunkPreviewWords(words, t.words);
  const chunk = chunks.find((c) => timeMs >= c.start && timeMs < c.end) ?? null;
  const c = t.colors;
  const act = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : c.accent;

  let activeIdx = -1;
  if (chunk) chunk.words.forEach((w, k) => { if (timeMs >= w.start) activeIdx = k; });

  const boxed = ["pill", "line", "sticker", "bar", "glass", "dark", "wordbox"].includes(t.container) || t.motion === "bubble" || t.motion === "blocks";
  const ol = t.motion === "hollow" || boxed ? "none" : outlineShadow(c.outline, c.outlineWidth, c.hardShadow);
  const grad = c.gradient;

  const capStyle = {
    "--ff": `"${t.type.font}", system-ui, sans-serif`,
    "--fw": String(t.type.weight),
    "--fst": t.type.italic ? "italic" : "normal",
    "--tt": t.type.case === "upper" ? "uppercase" : t.type.case === "lower" ? "lowercase" : "none",
    "--sz": String(t.type.size * sizeScale),
    "--ls": t.type.tracking ? `${t.type.tracking}em` : "0",
    "--base": c.base,
    "--act": act,
    "--st": c.outline ?? "#fff",
    "--box": c.box ?? "transparent",
    "--box2": c.box2 ?? "#20d68a",
    "--gl": c.glow ?? act,
    "--ol": ol,
    "--tilt": `${t.placement.tilt ?? 0}deg`,
    "--rot": `${STICKER_TILTS[(chunk?.index ?? 0) % STICKER_TILTS.length]}deg`,
    "--olc": c.outline ?? "#000",
    "--x": c.extrude ?? c.outline ?? "#000",
    "--act2": c.accent2 ?? "#FF2D55",
    "--sc": t.symbols?.colors[0] ?? "#fff",
    ...(grad ? { "--g1": grad.from, "--g2": grad.to } : {}),
    ...(positionY != null ? { "--py": `${positionY}%` } : {}),
    ...(positionX != null ? { "--px": `${positionX}%` } : {}),
  } as CSSProperties;

  const capClass = [
    s.cap,
    s[`fx_${t.motion}`],
    positionY != null ? s.pos_custom : s[`pos_${t.placement.y}`],
    t.container !== "none" ? s[`box_${t.container}`] : "",
    t.placement.align === "left" ? s.al_left : "",
    positionX != null ? s.pos_x : "",
    grad ? (grad.target === "all" ? s.gradall : s.grad) : "",
    t.wordBox === "pill" ? s.pillw : "",
    c.letterColors?.length ? s.lc : "",
    t.entry ? s[`in_${t.entry}`] : "",
    t.loop ? s[`lp_${t.loop}`] : "",
    s.enter,
  ].filter(Boolean).join(" ");

  const sym = t.symbols;
  const glyphs = sym ? Array.from(sym.glyphs) : [];
  const symColor = (k: number) => sym!.colors[k % sym!.colors.length];
  const letterWords = LETTER_MOTIONS.includes(t.motion) && t.script !== "devanagari";
  // The sticker emoji shows from its word until the next emoji word in the line.
  const stickerWord = t.emoji === "sticker" && chunk
    ? [...chunk.words.slice(0, activeIdx + 1)].reverse().find((w) => w.style?.emoji ?? w.emoji) ?? null
    : null;

  const speakerColor = (sp: number | undefined) => (c.speakers?.length ? c.speakers[(sp ?? 0) % c.speakers.length] : undefined);

  const wordEls = chunk?.words.map((w, k) => {
    const state = k === activeIdx ? s.on : k < activeIdx ? s.past : s.fut;
    const style: CSSProperties & Record<string, string> = {};
    if (t.motion === "bubble" || t.motion === "blocks") style["--bg"] = c.palette?.[w.i % c.palette.length] ?? "#fff";
    if (c.cycle?.length && k === activeIdx) style["--act"] = c.cycle[w.i % c.cycle.length];
    if (c.wordColors?.length) {
      style["--base"] = c.wordColors[w.i % c.wordColors.length];
      style["--act"] = style["--base"];
    }
    if (c.boxCycle?.length) style["--box"] = c.boxCycle[w.i % c.boxCycle.length];
    if (t.motion === "tiltswap") style["--wr"] = `${w.i % 2 ? 6 : -6}deg`;
    const sc = speakerColor(w.speaker);
    if (sc) style["--base"] = sc;
    const ws = w.style;
    const own = ws?.emphasis === "box" ? BOX_TEXT : ws?.color;
    if (own) {
      style["--base"] = own;
      style["--act"] = own;
    }
    if (ws?.emphasis === "box") style["--wbox"] = ws.color ?? act;
    if (ws?.emphasis === "bigger") style.fontSize = `${BIGGER_SCALE}em`;
    const wordClass = [
      ws?.emphasis === "box" ? s.wbox : "",
      ws?.emphasis === "shake" && t.motion !== "shake" && !NO_WORD_ACTIVE.has(t.motion) ? s.wshake : "",
    ].filter(Boolean).join(" ");
    const dur = Math.max(80, (chunk.words[k + 1]?.start ?? chunk.end) - w.start);
    style["--dur"] = `${dur - 30}ms`;
    // A user-picked emoji wins, and shows at the end of the word on a
    // template without emoji — the export's rule (engine/layout.ts).
    const emoji = ws?.emoji ?? (t.emoji !== "none" && w.emoji ? w.emoji : null);
    const emojiMode = ws?.emoji && t.emoji === "none" ? "end" : t.emoji;
    const sinceActive = timeMs - w.start;
    const on = k === activeIdx;
    const decoding = on && t.motion === "scramble" && sinceActive < SCRAMBLE_STEPS * SCRAMBLE_STEP_MS;
    const text = decoding ? scrambledWord(w.text, w.i, Math.max(0, Math.floor(sinceActive / SCRAMBLE_STEP_MS))) : w.text;
    return (
      <span key={`${chunk.index}-${k}`} className="contents">
        <span className={`${s.w} ${state} ${w.emphasis && t.motion === "emph" ? s.em : ""} ${wordClass}`} data-w={w.text} style={style}>
          {letterWords
            ? Array.from(w.text).map((ch, i) => (
                <span key={i} className={s.ch} style={{ "--i": i, ...(c.letterColors?.length ? { "--lc": c.letterColors[i % c.letterColors.length] } : {}) } as CSSProperties}>{ch}</span>
              ))
            : text}
          {on && sym?.mode === "sparkle" && SPARKLES.map(([x, y], j) => (
            <i key={j} className={`${s.sym} ${s.spk}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, color: symColor(j), animationDelay: `${j * 70}ms` }}>{glyphs[j % glyphs.length]}</i>
          ))}
          {on && sym?.mode === "orbit" && <i className={`${s.sym} ${s.orb}`} style={{ color: symColor(0) }}>{glyphs[0]}</i>}
          {on && sym?.mode === "arrow" && <i className={`${s.sym} ${s.arr}`} style={{ color: symColor(0) }}>{glyphs[0]}</i>}
          {on && sym?.mode === "confetti" && (w.emphasis || emoji) && sinceActive < 640 && Array.from({ length: 9 }, (_, j) => {
            const ang = (j / 9) * 2 * Math.PI - Math.PI / 2, r = 1.6 + (j % 3) * 0.35;
            return <i key={j} className={`${s.sym} ${s.conf}`} style={{ color: symColor(j), "--dx": `${(Math.cos(ang) * r).toFixed(2)}em`, "--dy": `${(Math.sin(ang) * r * 0.8).toFixed(2)}em` } as CSSProperties}>{glyphs[j % glyphs.length]}</i>;
          })}
          {emoji && on && emojiMode === "flank" && <><i className={`${s.emo} ${s.fl} ${s.fll}`}>{emoji}</i><i className={`${s.emo} ${s.fl} ${s.flr}`}>{emoji}</i></>}
          {emoji && on && emojiMode === "orbit" && <i className={`${s.emo} ${s.eorb}`}>{emoji}</i>}
          {emoji && k === activeIdx && emojiMode === "above" && <i className={`${s.emo} ${s.up}`}>{emoji}</i>}
          {emoji && k === activeIdx && emojiMode === "burst" && sinceActive < 520 &&
            [[-1.4, -1.75], [1.5, -1.5], [0, -2.4], [-1.75, 0.25], [1.75, 0.4]].map(([dx, dy], j) => (
              <i key={j} className={`${s.emo} ${s.burst}`} style={{ "--dx": `${dx}em`, "--dy": `${dy}em` } as CSSProperties}>{emoji}</i>
            ))}
        </span>
        {emoji && k <= activeIdx && emojiMode === "end" && <i className={`${s.emo} ${s.end}`}>{emoji}</i>}
        {t.container === "line" && k < chunk.words.length - 1 ? " " : null}
      </span>
    );
  });

  // Rain emoji live in the frame, not the caption block.
  const rain = t.emoji === "rain" && chunk
    ? chunk.words.flatMap((w) =>
        (w.style?.emoji ?? w.emoji) && timeMs >= w.start && timeMs < w.start + 1600
          ? [0, 1, 2, 3, 4].map((k) => (
              <i
                key={`${w.i}-${k}`}
                className={`${s.emo} ${s.rain}`}
                style={{ left: `${8 + k * 18 + (k % 2 ? 4 : -2)}%`, animationDelay: `${k * 90}ms` }}
              >
                {w.style?.emoji ?? w.emoji}
              </i>
            ))
          : [],
      )
    : null;

  const frameClass = [
    s.frame,
    fill ? s.free : "",
    scene ? s[`sc_${t.family}`] : s.transparent,
    t.extra === "letterbox" ? s.letterbox : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div className={frameClass} style={{ "--act": act } as CSSProperties} aria-hidden="true">
      {chunk && (
        <div key={chunk.index} ref={capRef} className={capClass} style={capStyle} data-caption-block="">
          {t.extra === "bars" && <span className={s.barsx}><i /><i /><i /><i /></span>}
          {t.extra === "square" && <span className={s.sq} />}
          {(sym?.mode === "prefix" || sym?.mode === "flank") && <span className={sym.mode === "prefix" ? s.symp : s.symf}>{glyphs[0]}</span>}
          {t.container === "line" ? <span className={s.lnw}>{wordEls}</span> : wordEls}
          {sym?.mode === "flank" && <span className={s.symf}>{glyphs[0]}</span>}
          {sym?.mode === "stars" && (() => {
            const filled = Math.min(5, Math.max(0, activeIdx + 1 + (chunk.index % 2) * 2));
            return <span className={s.stars}><b key={filled}>{"★".repeat(filled)}</b>{"★".repeat(5 - filled)}</span>;
          })()}
          {t.extra === "cursor" && <span className={s.cur} />}
        </div>
      )}
      {chunk && sym?.mode === "badge" && <div key={`b${chunk.index}`} className={s.badge} style={{ "--bc": symColor(0) } as CSSProperties}>{sym.glyphs}</div>}
      {stickerWord && (
        <div key={`s${stickerWord.i}`} className={s.emostk}><i className={s.emo}>{stickerWord.style?.emoji ?? stickerWord.emoji}</i></div>
      )}
      {chunk && t.extra === "quote" && <div className={s.qmark}>{"“"}</div>}
      {rain}
      {showSafeZone && <div className={s.safe} />}
    </div>
  );
}
