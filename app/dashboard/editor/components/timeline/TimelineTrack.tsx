"use client";

// One track row (video / text / audio) rendering its clips.

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { TrackKind } from "@/lib/editor/types";
import TimelineClip from "./TimelineClip";

const TRACK_HEIGHT: Record<TrackKind, string> = {
  video: "h-14",
  text: "h-9",
  audio: "h-9",
};

export default function TimelineTrack({ kind, label }: { kind: TrackKind; label: string }) {
  const clips = useEditorStore((s) => s.doc.tracks[kind]);

  return (
    <div className={`relative ${TRACK_HEIGHT[kind]} rounded-md bg-surface`}>
      {clips.length === 0 && (
        <span className="pointer-events-none sticky left-2 top-1/2 inline-block -translate-y-[-25%] px-2 text-[10px] text-ink-soft/60">
          {label}
        </span>
      )}
      {clips.map((clip) => (
        <TimelineClip key={clip.id} clip={clip} track={kind} />
      ))}
    </div>
  );
}
