"use client";

// One track row (video / text / audio) rendering its clips.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { TRANSITION_PRESETS, type TrackKind } from "@/lib/editor/types";
import { useAssets } from "../panels/shared/assetData";
import TimelineClip from "./TimelineClip";

export const TRACK_HEIGHT: Record<TrackKind, string> = {
  video: "h-14",
  text: "h-9",
  audio: "h-9",
  image: "h-9",
  caption: "h-9", // caption cues render via the separate CaptionTrack component, not this one
};

export default function TimelineTrack({ kind }: { kind: TrackKind }) {
  const clips = useEditorStore((s) => s.doc.tracks[kind]);
  const zoom = useEditorStore((s) => s.zoom);
  const select = useEditorStore((s) => s.select);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  // Fetched once per track (not per-clip) so N clips of the same asset don't
  // each trigger their own /api/assets request.
  const { assets } = useAssets(kind === "audio" ? "audio" : kind === "image" ? "image" : "video");

  return (
    <div className={`relative ${TRACK_HEIGHT[kind]} rounded-editor-sm bg-editor-elevated`}>
      {clips.map((clip) => {
        const assetId = "assetId" in clip ? clip.assetId : undefined;
        const asset = assetId ? assets.find((a) => a.id === assetId) : undefined;
        return (
          <TimelineClip key={clip.id} clip={clip} track={kind} assetUrl={asset?.url} assetName={asset?.name} />
        );
      })}
      {/* A chip on every cut between touching video clips: the transition there, or + to add one. */}
      {kind === "video" && clips.slice(0, -1).map((clip, i) => {
        const next = clips[i + 1];
        const at = clip.timelineStart + clip.duration;
        if (Math.abs(next.timelineStart - at) > 0.05) return null;
        const t = clip.type === "video" ? clip.transitionOut : undefined;
        return (
          <button
            key={`cut-${clip.id}`}
            type="button"
            title={t ? `Transition: ${TRANSITION_PRESETS[t].label}` : "Add a transition at this cut"}
            aria-label={t ? `Transition at ${at.toFixed(1)} s: ${TRANSITION_PRESETS[t].label}` : `Add a transition at ${at.toFixed(1)} s`}
            onClick={(e) => { e.stopPropagation(); select({ track: "video", clipId: clip.id }); setActivePanel("transition"); }}
            className={`absolute top-1/2 z-20 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-editor-bg px-1.5 text-[10px] font-bold ${t ? "bg-[var(--primary)] text-editor-bg" : "w-5 bg-editor-elevated text-editor-text hover:bg-editor-card"}`}
            style={{ left: at * zoom }}
          >
            {t ? TRANSITION_PRESETS[t].label.split(" ")[0] : "+"}
          </button>
        );
      })}
    </div>
  );
}
