"use client";

// Color filter presets — applies to the selected video clip. Fully working:
// FILTER_PRESETS already drives both the preview and the ffmpeg export (see
// VideoClipProps for the same control surfaced in the properties panel too).
// Each tile shows the filter on a frame of the clip and plays its own chord.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/editor/types";
import { showPanelToast } from "../ui";
import { playPresetSound } from "../../hooks/useUiSound";
import { ClipChip, LookFrame, LookTile, NoClipSelected, useLookTarget } from "./effects/lookShared";

export default function FilterPanel() {
  const updateClip = useEditorStore((s) => s.updateClip);
  const { clip, index, frame, firstClip } = useLookTarget();

  if (!clip) {
    return (
      <div className="editor-stagger flex flex-col gap-3 p-3">
        <NoClipSelected what="apply a colour filter" firstClip={firstClip} />
      </div>
    );
  }

  const current = clip.filter ?? "none";

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <ClipChip clip={clip} index={index} frame={frame} note={current === "none" ? "no filter" : FILTER_PRESETS[current].label} />
      <div className="editor-stagger-grid grid grid-cols-3 gap-2">
        {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((key) => (
          <LookTile
            key={key}
            label={FILTER_PRESETS[key].label}
            active={current === key}
            className=""
            onClick={() => {
              playPresetSound("filter", key);
              updateClip("video", clip.id, { filter: key === "none" ? undefined : key }, true);
              showPanelToast(key === "none" ? "Filter removed" : `${FILTER_PRESETS[key].label} on clip ${index + 1}`);
            }}
          >
            <LookFrame src={frame} className="transition-transform duration-300 group-hover:scale-110" style={{ filter: FILTER_PRESETS[key].css }} />
          </LookTile>
        ))}
      </div>
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">Fine-tune brightness, contrast and saturation on the right.</p>
    </div>
  );
}
