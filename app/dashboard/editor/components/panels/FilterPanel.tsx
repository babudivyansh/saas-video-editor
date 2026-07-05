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
        <p className="text-xs leading-relaxed text-zinc-500">
          Select a video clip on the timeline to apply a color filter.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Filter</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((key) => (
          <button
            key={key}
            onClick={() => updateClip("video", clip.id, { filter: key === "none" ? undefined : key })}
            className={`rounded-xl border p-3 text-left text-sm font-semibold transition-all cursor-pointer ${
              (clip.filter ?? "none") === key
                ? "border-violet-500 bg-violet-600/15 text-violet-300"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
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
