"use client";

// Renders a caption cue's text with word/phrase/karaoke highlighting driven
// purely by currentTime — same scrub-deterministic principle
// components/text/textAnimations.ts's getTextMotion already establishes (no
// framer-motion transition state), so scrubbing the timeline to any point
// shows the exact correct highlight state, not just during forward playback.
//
// "word" mode is a hard spotlight: only the single currently-active word is
// highlighted, reverting once it's done. "karaoke" is a progressive fill
// (matches the ASS \kf mechanism caption-ass.ts burns into the export): once
// a word's start time passes, it fills toward highlightColor and stays
// filled — via CSS color-mix(), which needs a modern evergreen browser
// (Chrome 111+/Firefox 113+/Safari 16.2+), acceptable for this editor.

import React from "react";
import type { CaptionClip } from "@/lib/editor/types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function renderCaptionWords(clip: CaptionClip, currentTime: number): React.ReactNode {
  if (!clip.words || clip.words.length === 0 || clip.highlightMode === "none") {
    return clip.text;
  }

  const elapsedMs = (currentTime - clip.timelineStart) * 1000;
  const baseColor = clip.color;
  const highlightColor = clip.highlightColor ?? clip.color;
  const scale = clip.activeWordScale ?? 1;
  const opacity = clip.activeWordOpacity ?? 1;

  if (clip.highlightMode === "phrase") {
    const started = elapsedMs >= clip.words[0].startMs;
    return <span style={{ color: started ? highlightColor : baseColor }}>{clip.text}</span>;
  }

  const words = clip.words;
  return words.map((w, i) => {
    const active = elapsedMs >= w.startMs && elapsedMs < w.endMs;
    let color: string;
    if (clip.highlightMode === "karaoke") {
      const frac = clamp01((elapsedMs - w.startMs) / Math.max(1, w.endMs - w.startMs));
      color = `color-mix(in srgb, ${highlightColor} ${Math.round(frac * 100)}%, ${baseColor})`;
    } else {
      // "word" — hard cut, only the currently-active word is highlighted.
      color = active ? highlightColor : baseColor;
    }
    return (
      <span
        key={i}
        style={{
          color,
          display: "inline-block",
          transform: active ? `scale(${scale})` : undefined,
          opacity: active ? opacity : 1,
        }}
      >
        {w.word}
        {i < words.length - 1 ? " " : ""}
      </span>
    );
  });
}
