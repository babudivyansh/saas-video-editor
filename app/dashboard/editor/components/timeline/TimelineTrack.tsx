"use client";

// One track row (video / text / audio) rendering its clips.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { TrackKind } from "@/lib/editor/types";
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
    </div>
  );
}
