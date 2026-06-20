"use client";

import { CAPTION_STYLES } from "@/lib/caption-styles";
import type { WordTiming, CaptionMode } from "@/lib/editor-types";

const WORDS_PER_LINE = 5; // must match generateASS in utils/ffmpeg-render.ts

// Live caption renderer synced to the video's current time. Mirrors how the ASS
// file is built (oneword = single word; lines = groups of 5 with the active word
// highlighted) so the preview matches the exported burn-in.
export default function CaptionOverlay({
  segments,
  mode,
  styleIndex,
  timeMs,
}: {
  segments: WordTiming[];
  mode: CaptionMode;
  styleIndex: number;
  timeMs: number;
}) {
  if (segments.length === 0) return null;
  const style = CAPTION_STYLES[Math.min(styleIndex, CAPTION_STYLES.length - 1)];

  // Active word = last word whose start has passed.
  let activeIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (timeMs >= segments[i].start) activeIdx = i;
    else break;
  }
  // Only show captions while within (or just after) a word.
  if (activeIdx < 0) return null;
  const cur = segments[activeIdx];
  if (timeMs > cur.end + 400) return null;

  const base: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontWeight: style.weight,
    fontStyle: style.italic ? "italic" : "normal",
    textTransform: style.uppercase ? "uppercase" : "none",
    textShadow: "0 2px 6px rgba(0,0,0,0.9), 0 0 3px #000",
    letterSpacing: 0.3,
    lineHeight: 1.1,
  };

  let content: React.ReactNode;
  if (mode === "oneword") {
    content = <span style={{ ...base, color: style.highlight }}>{cur.word}</span>;
  } else {
    const groupStart = Math.floor(activeIdx / WORDS_PER_LINE) * WORDS_PER_LINE;
    const group = segments.slice(groupStart, groupStart + WORDS_PER_LINE);
    content = (
      <span style={base}>
        {group.map((w, i) => {
          const idx = groupStart + i;
          return (
            <span key={idx} style={{ color: idx === activeIdx ? style.highlight : style.color }}>
              {w.word}{i < group.length - 1 ? " " : ""}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center px-4 text-center pointer-events-none"
      style={{ top: "50%", transform: "translateY(-50%)", fontSize: "clamp(18px, 7cqw, 40px)" }}
    >
      {content}
    </div>
  );
}
