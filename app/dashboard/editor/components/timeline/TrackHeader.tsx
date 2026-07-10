"use client";

// Fixed, non-scrolling label+icon column for one timeline track — always
// visible regardless of clip count (the old label only rendered when a
// track had zero clips). Pure presentation: no lock/hide affordances or
// interactivity in this pass.

import React from "react";
import { Video, Image as ImageIcon, Type, Music2 } from "lucide-react";
import type { TrackKind } from "@/lib/editor/types";

const TRACK_ICONS: Record<TrackKind, React.ReactNode> = {
  video: <Video className="h-3.5 w-3.5" />,
  image: <ImageIcon className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  audio: <Music2 className="h-3.5 w-3.5" />,
};

const TRACK_TEXT_COLOR: Record<TrackKind, string> = {
  video: "text-editor-track-video",
  image: "text-editor-track-image",
  text: "text-editor-track-text",
  audio: "text-editor-track-audio",
};

export default function TrackHeader({ kind, label, height }: { kind: TrackKind; label: string; height: string }) {
  return (
    <div className={`flex ${height} w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5`}>
      <span className={TRACK_TEXT_COLOR[kind]}>{TRACK_ICONS[kind]}</span>
      <span className="text-[9px] font-medium text-editor-text-faint">{label}</span>
    </div>
  );
}
