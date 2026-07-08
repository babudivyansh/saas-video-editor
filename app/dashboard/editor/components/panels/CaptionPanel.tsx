"use client";

// Caption style presets — same mechanism as the Text panel (drops a text
// clip at the playhead) but tuned for bottom-anchored subtitle looks. For
// auto-transcribed captions synced to speech, select a video clip and use
// "Auto captions" in its properties panel (already wired to ElevenLabs STT).

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { TextClip } from "@/lib/editor/types";

const PRESETS: { label: string; preview: string; partial: Partial<TextClip> }[] = [
  {
    label: "Classic subtitle",
    preview: "clean subtitle line",
    partial: { fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, y: 0.85, bgColor: "#000000" },
  },
  {
    label: "Bold highlight",
    preview: "BIG BOLD WORD",
    partial: { fontFamily: "Impact", fontSizePct: 0.055, color: "#fbbf24", bold: true, y: 0.8, bgColor: null },
  },
  {
    label: "Karaoke box",
    preview: "boxed caption style",
    partial: { fontFamily: "Arial", fontSizePct: 0.045, color: "#ffffff", bold: true, y: 0.82, bgColor: "#7c3aed" },
  },
  {
    label: "Minimal",
    preview: "quiet caption",
    partial: { fontFamily: "Arial", fontSizePct: 0.035, color: "#e5e7eb", bold: false, y: 0.9, bgColor: null },
  },
  {
    label: "Gradient bar",
    preview: "punchy caption bar",
    partial: { fontFamily: "Arial", fontSizePct: 0.042, color: "#ffffff", bold: true, y: 0.86, bgColor: "#db2777" },
  },
  {
    label: "Outline pop",
    preview: "OUTLINED WORD",
    partial: { fontFamily: "Impact", fontSizePct: 0.05, color: "#ffffff", bold: true, y: 0.78, bgColor: null },
  },
  {
    label: "TikTok style",
    preview: "trendy caption",
    partial: { fontFamily: "Poppins", fontSizePct: 0.048, color: "#ffffff", bold: true, y: 0.75, bgColor: "#000000" },
  },
  {
    label: "News ticker",
    preview: "BREAKING: caption text",
    partial: { fontFamily: "Oswald", fontSizePct: 0.032, color: "#ffffff", bold: true, y: 0.94, bgColor: "#b91c1c" },
  },
  {
    label: "Poster caption",
    preview: "BIG STATEMENT",
    partial: { fontFamily: "Bebas Neue", fontSizePct: 0.06, color: "#ffffff", bold: false, y: 0.82, bgColor: null },
  },
  {
    label: "Soft serif",
    preview: "a gentle note",
    partial: { fontFamily: "Playfair Display", fontSizePct: 0.04, color: "#f5f5f4", bold: false, y: 0.88, bgColor: null },
  },
];

export default function CaptionPanel() {
  const addTextClip = useEditorStore((s) => s.addTextClip);

  const add = (preset: (typeof PRESETS)[number]) => {
    const t = useEditorStore.getState().currentTime;
    addTextClip({
      type: "text",
      id: crypto.randomUUID(),
      timelineStart: t,
      duration: 3,
      text: preset.preview,
      fontFamily: "Arial",
      fontSizePct: 0.04,
      color: "#ffffff",
      bold: true,
      align: "center",
      x: 0.5,
      y: 0.85,
      bgColor: "#000000",
      ...preset.partial,
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Caption styles</p>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => add(p)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left transition-all hover:border-violet-500 cursor-pointer"
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{p.label}</p>
            <p
              className="mt-1 truncate text-zinc-100"
              style={{
                fontFamily: p.partial.fontFamily,
                fontWeight: p.partial.bold ? 700 : 400,
                fontSize: `${(p.partial.fontSizePct ?? 0.04) * 220}px`,
                color: p.partial.color,
              }}
            >
              {p.preview}
            </p>
          </button>
        ))}
      </div>
      <p className="mt-1 px-1 text-[10px] leading-snug text-zinc-500">
        These drop a styled caption at the playhead. For captions auto-synced to speech, select a video clip
        and use &quot;Auto captions&quot; in the properties panel on the right (1 credit).
      </p>
    </div>
  );
}
