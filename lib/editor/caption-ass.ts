// Generates an ASS subtitle file covering the WHOLE caption track — one
// ffmpeg `subtitles=` filter then burns it in as a single filter node
// regardless of cue count (vs. hundreds of chained drawtext filters for
// equivalent per-clip text). Adapts the same karaoke (\k/\kf) mechanism
// utils/ffmpeg-render.ts's generateASS() already proves in production for
// the Auto-Clip pipeline, extended to the editor's richer per-cue style
// model via inline ASS override tags on each line rather than named styles —
// one Default style plus a per-line override prefix covers the full field
// surface without needing to correlate each Dialogue line to one of several
// named styles.
//
// Not exported for real here (preview-only, same convention as several
// TextClip fields): bgColor — ASS has no simple per-line "box behind text"
// override tag (BorderStyle=3's opaque-box mode is a per-Style setting, not
// something \-tags can flip mid-line), so a solid background pill stays a
// live-preview-only feature for captions.

import fs from "fs";
import type { Aspect, CaptionClip } from "./types";
import { ASPECT_DIMENSIONS } from "./types";
import { toASSTime } from "@/utils/ffmpeg-render";

function toASSColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function escapeASSText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

function applyTextTransform(text: string, transform: CaptionClip["textTransform"]): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

/** Builds the \k/\kf-tagged body for a cue, per its highlightMode. "karaoke"
 *  uses \kf (progressive fill sweep) — the exact tag the proven Auto-Clip
 *  generateASS() already burns. "word" uses \k (hard, instant switch at each
 *  word's end — no sweep). "phrase" wraps the whole line in one \kf run. Each
 *  word/phrase carries its own \1c override so per-cue highlight color works
 *  without a shared named SecondaryColour style. */
function karaokeBody(clip: CaptionClip): string {
  const text = escapeASSText(applyTextTransform(clip.text, clip.textTransform));
  if (!clip.words || clip.words.length === 0 || clip.highlightMode === "none") {
    return text;
  }
  const speed = clip.highlightSpeed ?? 1;
  const highlight = toASSColor(clip.highlightColor ?? clip.color);

  if (clip.highlightMode === "phrase") {
    const totalMs = clip.words[clip.words.length - 1].endMs - clip.words[0].startMs;
    const durationCs = Math.max(1, Math.round(totalMs / 10 / speed));
    return `{\\1c${highlight}\\kf${durationCs}}${text}`;
  }

  const tag = clip.highlightMode === "karaoke" ? "kf" : "k";
  const words = clip.words;
  return words
    .map((w, i) => {
      const durationCs = Math.max(1, Math.round((w.endMs - w.startMs) / 10 / speed));
      const word = escapeASSText(applyTextTransform(w.word, clip.textTransform));
      return `{\\1c${highlight}\\${tag}${durationCs}}${word}${i < words.length - 1 ? " " : ""}`;
    })
    .join("");
}

function overrideTags(clip: CaptionClip, W: number, H: number): string {
  const tags: string[] = [
    `\\fn${clip.fontFamily}`,
    `\\fs${Math.round(clip.fontSizePct * H)}`,
    `\\1c${toASSColor(clip.color)}`,
    `\\b${clip.bold ? 1 : 0}`,
  ];
  if (clip.strokeColor) {
    tags.push(`\\3c${toASSColor(clip.strokeColor)}`, `\\bord${Math.max(1, Math.round((clip.strokeWidthPct ?? 0.01) * H))}`);
  } else {
    tags.push(`\\bord0`);
  }
  if (clip.shadow) {
    const shadowPx = ((Math.abs(clip.shadow.offsetXPct) + Math.abs(clip.shadow.offsetYPct)) / 2) * H;
    tags.push(`\\shad${Math.max(1, Math.round(shadowPx))}`);
  } else {
    tags.push(`\\shad0`);
  }
  if (clip.opacity !== undefined) {
    const alpha = Math.round((1 - clip.opacity) * 255).toString(16).padStart(2, "0").toUpperCase();
    tags.push(`\\1a&H${alpha}&`);
  }
  // \an5 = middle-center anchor, so \pos's point is the text block's CENTER —
  // matches CaptionClip.x/y's normalized-center semantics (same convention
  // filtergraph.ts's drawtext block already uses for TextClip).
  tags.push(`\\an5`, `\\pos(${Math.round(clip.x * W)},${Math.round(clip.y * H)})`);
  return `{${tags.join("")}}`;
}

export function generateCaptionASS(captions: CaptionClip[], aspect: Aspect, assPath: string): void {
  const { w: W, h: H } = ASPECT_DIMENSIONS[aspect];

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${Math.round(0.04 * H)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = "";
  for (const clip of captions) {
    if (clip.hidden) continue;
    const start = toASSTime(clip.timelineStart * 1000);
    const end = toASSTime((clip.timelineStart + clip.duration) * 1000);
    const text = overrideTags(clip, W, H) + karaokeBody(clip);
    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  fs.writeFileSync(assPath, header + events, "utf8");
}
