"use client";

// Visual effect presets — browsable/selectable on the selected video clip.
// Preview-only for now: the choice is stored on the clip but the render
// pipeline doesn't apply it yet (see EFFECT_PRESETS in lib/editor/types.ts).
// Each preset (bar "None") shows a decorative looping GIF via GIPHY — same
// key already used for stickers — purely to illustrate the vibe; it's not
// the actual effect motion (which only exists once applied to a real clip).

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { EFFECT_PRESETS, type EffectPreset } from "@/lib/editor/types";
import { usePresetGif } from "./usePresetGif";

const PREVIEW_QUERY: Partial<Record<EffectPreset, string>> = {
  shake: "camera shake",
  zoomPulse: "zoom pulse",
  glitch: "glitch",
  filmGrain: "film grain texture",
  bounce: "bounce",
  flicker: "flicker light",
  vignettePulse: "vignette",
  chromaticAberration: "chromatic aberration glitch",
  oldFilm: "old film reel",
};

function PresetButton({
  presetKey,
  label,
  active,
  onClick,
}: {
  presetKey: EffectPreset;
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

export default function EffectPanel() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const updateClip = useEditorStore((s) => s.updateClip);

  const clip = selection?.track === "video" ? doc.tracks.video.find((c) => c.id === selection.clipId) : null;

  if (!clip) {
    return (
      <div className="p-4">
        <p className="text-xs leading-relaxed text-zinc-500">
          Select a video clip on the timeline to apply an effect.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Effect</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(EFFECT_PRESETS) as EffectPreset[]).map((key) => (
          <PresetButton
            key={key}
            presetKey={key}
            label={EFFECT_PRESETS[key].label}
            active={(clip.effect ?? "none") === key}
            onClick={() => updateClip("video", clip.id, { effect: key === "none" ? undefined : key })}
          />
        ))}
      </div>
      <p className="mt-1 px-1 text-[10px] leading-snug text-zinc-500">
        Preview only for now — effects aren&apos;t applied to the exported video yet.
      </p>
    </div>
  );
}
