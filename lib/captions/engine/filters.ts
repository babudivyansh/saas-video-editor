// The ffmpeg filter fragment that burns a caption track into a video stream:
//   1. glass blur: blur the video under the panel, only while a panel shows
//   2. ass: the subtitle file, fontsdir at the bundled fonts, complex shaping
//   3. emoji: one colour PNG overlay per planned emoji (libass can't draw them)
//
// The fragment is a -filter_complex chain from `[inLabel]` to `[outLabel]`.
// Coordinates in the track are in the video's own pixels, so the track must be
// built with the size of the stream at this point in the graph.

import path from "node:path";
import { CAPTION_FONTS_DIR } from "./fonts";
import type { CaptionTrack } from "./ass";

export const EMOJI_DIR = path.join(process.cwd(), "public", "emoji");

/** Path quoting for filter arguments (same rule as lib/editor/filtergraph.ts). */
export function escapeFilterArg(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const n2 = (n: number) => Math.round(n * 100) / 100;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export interface CaptionFilterOptions {
  track: CaptionTrack;
  assPath: string;
  inLabel: string;
  outLabel: string;
  /** Prefix for intermediate labels, unique per graph. */
  prefix?: string;
}

export function buildCaptionFilterChain(opts: CaptionFilterOptions): string {
  const { track } = opts;
  const p = opts.prefix ?? "cap";
  const parts: string[] = [];
  let cur = opts.inLabel;
  const { W, H } = track.layout;

  const g = track.glass;
  if (g && g.windows.length) {
    const x = Math.max(0, Math.min(W - 2, even(g.x)));
    const y = Math.max(0, Math.min(H - 2, even(g.y)));
    const w = Math.min(even(g.w), W - x - (W - x) % 2);
    const h = Math.min(even(g.h), H - y - (H - y) % 2);
    const lr = Math.max(1, Math.min(18, Math.floor(Math.min(w, h) / 2) - 1));
    const cr = Math.max(1, Math.min(9, Math.floor(Math.min(w, h) / 4) - 1));
    const enable = g.windows.map(([s, e]) => `between(t,${n2(s)},${n2(e)})`).join("+");
    parts.push(`[${cur}]split[${p}g0][${p}g1]`);
    parts.push(`[${p}g1]crop=${w}:${h}:${x}:${y},boxblur=lr=${lr}:lp=2:cr=${cr}:cp=2[${p}gb]`);
    parts.push(`[${p}g0][${p}gb]overlay=${x}:${y}:enable='${enable}'[${p}g]`);
    cur = `${p}g`;
  }

  const subsOut = track.emoji.length ? `${p}s` : opts.outLabel;
  // The `ass` filter, not `subtitles`: only `ass` exposes libass's shaping
  // mode, and without complex shaping Devanagari is drawn letter by letter
  // (no conjuncts, vowel signs on the wrong side). Same libass underneath.
  parts.push(`[${cur}]ass=filename='${escapeFilterArg(opts.assPath)}':fontsdir='${escapeFilterArg(CAPTION_FONTS_DIR)}':shaping=complex[${subsOut}]`);
  cur = subsOut;

  if (track.emoji.length) {
    // One movie source per (file, size), split once per use.
    const groups = new Map<string, number[]>();
    track.emoji.forEach((e, i) => {
      const key = `${e.file}|${e.size}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    const label = new Map<number, string>();
    let gi = 0;
    for (const [key, idxs] of groups) {
      const [file, size] = key.split("|");
      const src = `movie=filename='${escapeFilterArg(path.join(EMOJI_DIR, file))}',scale=${size}:${size},format=rgba`;
      const outs = idxs.map((_, k) => `${p}e${gi}_${k}`);
      parts.push(idxs.length > 1 ? `${src},split=${idxs.length}${outs.map((o) => `[${o}]`).join("")}` : `${src}[${outs[0]}]`);
      idxs.forEach((i, k) => label.set(i, outs[k]));
      gi++;
    }
    track.emoji.forEach((e, i) => {
      const next = i === track.emoji.length - 1 ? opts.outLabel : `${p}o${i}`;
      let x = e.vx ? `${e.x}+${n2(e.vx)}*(t-${n2(e.start)})` : `${e.x}`;
      let y = e.vy ? `${e.y}+${n2(e.vy)}*(t-${n2(e.start)})` : `${e.y}`;
      if (e.orbit) {
        // Circles (cx,cy) clockwise from 3 o'clock; x/y are the image's top-left.
        const a = `2*PI*(t-${n2(e.start)})/${n2(e.orbit.period)}`;
        x = `${n2(e.orbit.cx - e.size / 2)}+${n2(e.orbit.r)}*cos(${a})`;
        y = `${n2(e.orbit.cy - e.size / 2)}+${n2(e.orbit.r)}*sin(${a})`;
      }
      parts.push(`[${cur}][${label.get(i)}]overlay=x='${x}':y='${y}':enable='between(t,${n2(e.start)},${n2(e.end)})'[${next}]`);
      cur = next;
    });
  }

  return parts.join(";");
}
