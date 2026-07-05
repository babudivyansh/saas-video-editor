"use client";

// One track row (video / text / audio) rendering its clips.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { TrackKind } from "@/lib/editor/types";
import { useAssets } from "../panels/MediaPanel";
import TimelineClip from "./TimelineClip";

const TRACK_HEIGHT: Record<TrackKind, string> = {
  video: "h-14",
  text: "h-9",
  audio: "h-9",
  image: "h-9",
};

export default function TimelineTrack({ kind, label }: { kind: TrackKind; label: string }) {
  const clips = useEditorStore((s) => s.doc.tracks[kind]);
  // Fetched once per track (not per-clip) so N clips of the same asset don't
  // each trigger their own /api/assets request.
  const { assets } = useAssets(kind === "audio" ? "audio" : kind === "image" ? "image" : "video");

  return (
    <div className={`relative ${TRACK_HEIGHT[kind]} rounded-md bg-zinc-900`}>
      {clips.length === 0 && (
        <span className="pointer-events-none sticky left-2 top-1/2 inline-block -translate-y-[-25%] px-2 text-[10px] text-zinc-600">
          {label}
        </span>
      )}
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
