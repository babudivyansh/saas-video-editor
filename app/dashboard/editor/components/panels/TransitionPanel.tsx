"use client";

// Transition presets for the OUT edge of the selected video clip. Preview-only
// for now — the current timeline model requires non-overlapping video clips,
// so real crossfade-style transitions need a render-pipeline change beyond
// this pass (see TRANSITION_PRESETS in lib/editor/types.ts).
// Each preset (bar "Cut") shows a decorative looping GIF via GIPHY — same key
// already used for stickers — purely to illustrate the vibe, not the actual
// transition motion (which only exists once applied between two real clips).

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { TRANSITION_PRESETS, type TransitionPreset } from "@/lib/editor/types";
import { usePresetGif } from "./usePresetGif";

const PREVIEW_QUERY: Partial<Record<TransitionPreset, string>> = {
  fade: "fade transition",
  slideLeft: "slide transition",
  slideUp: "slide up transition",
  zoomIn: "zoom in transition",
  slideRight: "slide right transition",
  slideDown: "slide down transition",
  zoomOut: "zoom out transition",
  wipe: "wipe transition",
  dipToBlack: "fade to black",
};

function PresetButton({
  presetKey,
  label,
  active,
  onClick,
}: {
  presetKey: TransitionPreset;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const query = PREVIEW_QUERY[presetKey];
  const gifUrl = usePresetGif(query ?? "");

  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border text-left text-sm font-semibold transition-all cursor-pointer ${
        active ? "border-violet-500 bg-violet-600/15 text-violet-300" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
      }`}
    >
      {gifUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gifUrl} alt="" className="h-16 w-full object-cover opacity-60" />
      )}
      <span className="block p-3">{label}</span>
    </button>
  );
}

export default function TransitionPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const updateClip = useEditorStore((s) => s.updateClip);

  const clip = selection?.track === "video" ? doc.tracks.video.find((c) => c.id === selection.clipId) : null;

  if (!clip) {
    return (
      <div className="p-4">
        <p className="text-xs leading-relaxed text-zinc-500">
          Select a video clip on the timeline to set its outgoing transition.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Transition (out)</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(TRANSITION_PRESETS) as TransitionPreset[]).map((key) => (
          <PresetButton
            key={key}
            presetKey={key}
            label={TRANSITION_PRESETS[key].label}
            active={(clip.transitionOut ?? "none") === key}
            onClick={() => updateClip("video", clip.id, { transitionOut: key === "none" ? undefined : key })}
          />
        ))}
      </div>
      <p className="mt-1 px-1 text-[10px] leading-snug text-zinc-500">
        Preview only for now — transitions aren&apos;t applied to the exported video yet.
      </p>
    </div>
  );
}
