"use client";

// Color filter presets — applies to the selected video clip. Fully working:
// FILTER_PRESETS already drives both the preview and the ffmpeg export (see
// VideoClipProps for the same control surfaced in the properties panel too).

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/editor/types";

export default function FilterPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const updateClip = useEditorStore((s) => s.updateClip);

  const clip = selection?.track === "video" ? doc.tracks.video.find((c) => c.id === selection.clipId) : null;

  if (!clip) {
    return (
      <div className="p-4">
        <p className="text-xs leading-relaxed text-editor-text-muted">
          Select a video clip on the timeline to apply a color filter.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-editor-text-muted">Filter</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((key) => (
          <button
            key={key}
            onClick={() => updateClip("video", clip.id, { filter: key === "none" ? undefined : key })}
            className={`rounded-xl border p-3 text-left text-sm font-semibold transition-all cursor-pointer ${
              (clip.filter ?? "none") === key
                ? "border-editor-accent bg-editor-accent/15 text-editor-accent"
                : "border-editor-border bg-editor-card text-editor-text hover:border-editor-border-strong"
            }`}
            style={{ filter: FILTER_PRESETS[key].css }}
          >
            {FILTER_PRESETS[key].label}
          </button>
        ))}
      </div>
    </div>
  );
}
