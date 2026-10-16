// The caption track as an .srt subtitle file (header Export menu →
// "Download captions"). Pure and client-safe.

import type { CaptionClip } from "./types";

function stamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(rest, 3)}`;
}

/** Visible (not hidden), non-empty cues in time order, numbered from 1. */
export function captionsToSrt(captions: CaptionClip[]): string {
  return captions
    .filter((c) => !c.hidden && c.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.timelineStart - b.timelineStart)
    .map((c, i) => `${i + 1}\n${stamp(c.timelineStart)} --> ${stamp(c.timelineStart + c.duration)}\n${c.text.trim()}\n`)
    .join("\n");
}
