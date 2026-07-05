"use client";

// Text panel: preset text styles — clicking one drops a 4s text clip at the
// playhead, selected and ready to edit in the properties panel.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { TextClip } from "@/lib/editor/types";

const PRESETS: { label: string; preview: string; partial: Partial<TextClip> }[] = [
  {
    label: "Headline",
    preview: "BIG BOLD HOOK",
    partial: { fontFamily: "Anton", fontSizePct: 0.07, color: "#ffffff", bold: true, y: 0.2, bgColor: null },
  },
  {
    label: "Caption",
    preview: "clean subtitle line",
    partial: { fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, y: 0.85, bgColor: "#000000" },
  },
  {
    label: "Lower third",
    preview: "Name · Title",
    partial: { fontFamily: "Montserrat", fontSizePct: 0.035, color: "#ffffff", bold: false, x: 0.28, y: 0.78, bgColor: "#0a8f70" },
  },
  {
    label: "Serif quote",
    preview: "“something said”",
    partial: { fontFamily: "Playfair Display", fontSizePct: 0.05, color: "#ffffff", bold: false, y: 0.5, bgColor: null },
  },
  {
    label: "Bold impact",
    preview: "STOP SCROLLING",
    partial: { fontFamily: "Impact", fontSizePct: 0.08, color: "#fbbf24", bold: true, y: 0.15, bgColor: null },
  },
  {
    label: "Highlight tag",
    preview: "NEW",
    partial: { fontFamily: "Poppins", fontSizePct: 0.04, color: "#000000", bold: true, y: 0.12, bgColor: "#fbbf24" },
  },
  {
    label: "Minimal caption",
    preview: "quiet little line",
    partial: { fontFamily: "Arial", fontSizePct: 0.032, color: "#e5e7eb", bold: false, y: 0.9, bgColor: null },
  },
  {
    label: "Question hook",
    preview: "Did you know this?",
    partial: { fontFamily: "Poppins", fontSizePct: 0.06, color: "#ffffff", bold: true, y: 0.25, bgColor: "#dc2626" },
  },
  {
    label: "Poster",
    preview: "SALE ENDS SOON",
    partial: { fontFamily: "Bebas Neue", fontSizePct: 0.09, color: "#ffffff", bold: false, y: 0.18, bgColor: null },
  },
  {
    label: "Sporty",
    preview: "GAME DAY",
    partial: { fontFamily: "Oswald", fontSizePct: 0.065, color: "#ffffff", bold: true, y: 0.22, bgColor: "#111827" },
  },
  {
    label: "Modern sans",
    preview: "Clean & modern",
    partial: { fontFamily: "Montserrat", fontSizePct: 0.045, color: "#ffffff", bold: true, y: 0.5, bgColor: null },
  },
  {
    label: "Editorial",
    preview: "A quiet moment",
    partial: { fontFamily: "Playfair Display", fontSizePct: 0.045, color: "#f5f5f4", bold: false, y: 0.88, bgColor: null },
  },
];

export default function TextPanel() {
  const addTextClip = useEditorStore((s) => s.addTextClip);

  const add = (preset: (typeof PRESETS)[number]) => {
    const t = useEditorStore.getState().currentTime;
    addTextClip({
      type: "text",
      id: crypto.randomUUID(),
      timelineStart: t,
      duration: 4,
      text: preset.preview,
      fontFamily: "Arial",
      fontSizePct: 0.05,
      color: "#ffffff",
      bold: false,
      align: "center",
      x: 0.5,
      y: 0.5,
      bgColor: null,
      ...preset.partial,
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <button
        onClick={() => add({ label: "Plain text", preview: "Text", partial: {} })}
        className="rounded-lg bg-violet-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-500 cursor-pointer"
      >
        + Add Text
      </button>
      <p className="mt-1 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Text styles</p>
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
                fontSize: `${(p.partial.fontSizePct ?? 0.05) * 220}px`,
              }}
            >
              {p.preview}
            </p>
          </button>
        ))}
      </div>
      <p className="px-1 text-[10px] leading-snug text-zinc-500">
        Text is added at the playhead. Drag it on the preview to position, and edit content in the panel on the right.
      </p>
    </div>
  );
}
