"use client";

// Transition presets for the OUT edge of the selected video clip — applied at
// export via ffmpeg xfade (the outgoing clip is freeze-frame-padded so clip
// timings never shift; see TRANSITION_PRESETS/filtergraph.ts). Presets whose
// `xfade` is null aren't supported by the pipeline yet and are hidden here.
// Each tile plays the move on hover (this clip's frame giving way to the next
// clip's), and clicking one plays its whoosh.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { TRANSITION_PRESETS, type TransitionPreset } from "@/lib/editor/types";
import { showPanelToast } from "../ui";
import { playPresetSound, playUiSound } from "../../hooks/useUiSound";
import { ClipChip, LookFrame, LookTile, NoClipSelected, useLookTarget } from "./effects/lookShared";

export default function TransitionPanel() {
  const updateClip = useEditorStore((s) => s.updateClip);
  const applyAll = useEditorStore((s) => s.applyTransitionToAllCuts);
  const { clip, index, frame, firstClip, clipCount } = useLookTarget();
  const cuts = Math.max(0, clipCount - 1);

  if (!clip) {
    return (
      <div className="editor-stagger flex flex-col gap-3 p-3">
        <NoClipSelected what="set its outgoing transition" firstClip={firstClip} />
      </div>
    );
  }

  const current = clip.transitionOut ?? "none";
  const isLast = index === clipCount - 1;

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <ClipChip clip={clip} index={index} frame={frame} note={isLast ? "last clip — no cut after it" : `into clip ${index + 2}`} />
      <div className="editor-stagger-grid grid grid-cols-3 gap-2">
        {(Object.keys(TRANSITION_PRESETS) as TransitionPreset[])
          .filter((key) => key === "none" || TRANSITION_PRESETS[key].xfade !== null)
          .map((key) => (
            <LookTile
              key={key}
              label={key === "none" ? "Cut" : TRANSITION_PRESETS[key].label}
              active={current === key}
              className="editor-tx-tile"
              onClick={() => {
                playPresetSound("transition", key);
                updateClip("video", clip.id, { transitionOut: key === "none" ? undefined : key }, true);
                showPanelToast(key === "none" ? "Straight cut" : `${TRANSITION_PRESETS[key].label} out of clip ${index + 1}`);
              }}
            >
              <LookFrame src={frame} />
              {key !== "none" && (
                <span className={`editor-tx-incoming tx-${key} absolute inset-0 flex items-center justify-center bg-[#2e3b3a] text-[11px] font-bold text-editor-text`}>
                  {key === "dipToBlack" ? "" : "NEXT"}
                </span>
              )}
            </LookTile>
          ))}
      </div>
      {cuts > 0 && (
        <button
          type="button"
          onClick={() => {
            applyAll(clip.transitionOut);
            playUiSound("go");
            showPanelToast(`“${TRANSITION_PRESETS[current].label}” on all ${cuts} cut${cuts === 1 ? "" : "s"}`);
          }}
          className="editor-press w-full rounded-editor-md border border-editor-border bg-editor-card px-3 py-2 text-[12px] font-semibold text-editor-text hover:border-editor-accent/50"
        >
          Use “{current === "none" ? "Cut" : TRANSITION_PRESETS[current].label}” on all {cuts} cut{cuts === 1 ? "" : "s"}
        </button>
      )}
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">
        Exported as a 0.5s transition into the next clip. The canvas approximates it as a fade.
      </p>
    </div>
  );
}
