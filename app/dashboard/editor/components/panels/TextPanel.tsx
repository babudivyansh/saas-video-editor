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
    partial: { fontFamily: "Impact", fontSizePct: 0.07, color: "#ffffff", bold: true, y: 0.2, bgColor: null },
  },
  {
    label: "Caption",
    preview: "clean subtitle line",
    partial: { fontFamily: "Arial", fontSizePct: 0.04, color: "#ffffff", bold: true, y: 0.85, bgColor: "#000000" },
  },
  {
    label: "Lower third",
    preview: "Name · Title",
    partial: { fontFamily: "Arial", fontSizePct: 0.035, color: "#ffffff", bold: false, x: 0.28, y: 0.78, bgColor: "#0a8f70" },
  },
  {
    label: "Serif quote",
    preview: "“something said”",
    partial: { fontFamily: "Times New Roman", fontSizePct: 0.05, color: "#ffffff", bold: false, y: 0.5, bgColor: null },
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
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Text styles</p>
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => add(p)}
          className="rounded-xl border border-card-border bg-white p-3 text-left transition-all hover:border-brand hover:shadow-card cursor-pointer"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{p.label}</p>
          <p
            className="mt-1 truncate text-ink"
            style={{
              fontFamily: p.partial.fontFamily,
              fontWeight: p.partial.bold ? 700 : 400,
              fontSize: `${(p.partial.fontSizePct ?? 0.05) * 280}px`,
            }}
          >
            {p.preview}
          </p>
        </button>
      ))}
      <p className="px-1 text-[10px] leading-snug text-ink-soft">
        Text is added at the playhead. Drag it on the preview to position, and edit content in the panel on the right.
      </p>
    </div>
  );
}
