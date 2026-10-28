"use client";

// Visual effect presets — applied to the selected video clip and burned in
// at export by the render pipeline (EFFECT_PRESETS in lib/editor/types.ts);
// the canvas shows a CSS approximation during playback. Each tile plays that
// same approximation (its previewClass) on a frame of the selected clip
// while hovered or applied, and clicking one plays the effect's sound.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { EFFECT_PRESETS, type EffectPreset } from "@/lib/editor/types";
import { Slider, showPanelToast } from "../ui";
import { playPresetSound } from "../../hooks/useUiSound";
import { ClipChip, LookFrame, LookTile, NoClipSelected, useLookTarget } from "./effects/lookShared";

export default function EffectPanel() {
  const updateClip = useEditorStore((s) => s.updateClip);
  const { clip, index, frame, firstClip } = useLookTarget();

  if (!clip) {
    return (
      <div className="editor-stagger flex flex-col gap-3 p-3">
        <NoClipSelected what="add an effect" firstClip={firstClip} />
      </div>
    );
  }

  const current = clip.effect ?? "none";

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <ClipChip clip={clip} index={index} frame={frame} note={current === "none" ? "no effect" : EFFECT_PRESETS[current].label} />
      <div className="editor-stagger-grid grid grid-cols-3 gap-2">
        {(Object.keys(EFFECT_PRESETS) as EffectPreset[]).map((key) => (
          <LookTile
            key={key}
            label={EFFECT_PRESETS[key].label}
            active={current === key}
            className="editor-fx-tile"
            onClick={() => {
              playPresetSound("effect", key);
              updateClip("video", clip.id, { effect: key === "none" ? undefined : key }, true);
              showPanelToast(key === "none" ? "Effect removed" : `${EFFECT_PRESETS[key].label} applied to clip ${index + 1}`);
            }}
          >
            <LookFrame src={frame} className={`editor-fx-frame ${EFFECT_PRESETS[key].previewClass ?? ""}`} />
          </LookTile>
        ))}
      </div>
      {current !== "none" && (
        <Slider
          label="Strength"
          value={clip.effectStrength ?? 1}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => updateClip("video", clip.id, { effectStrength: v >= 1 ? undefined : v })}
        />
      )}
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">
        Hover a tile to preview it on this clip. Burned into the export; the canvas shows a close live preview. Timing lives on the right.
      </p>
    </div>
  );
}
