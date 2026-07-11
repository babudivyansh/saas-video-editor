"use client";

// The caption track row — parallel to TimelineTrack.tsx, not a variant of it.
// Only mounts cues whose time span overlaps the current visible scroll
// window (time-range windowing, recomputed on scroll/zoom), so a video with
// hundreds of caption cues never mounts more DOM than fits on screen at once,
// regardless of total cue count. This is a different technique than the left
// panel's Caption List (index-based virtualization via @tanstack/react-virtual).

import React, { useMemo } from "react";
import { useEditorStore } from "../../store/editorStore";
import CaptionTimelineClip from "./CaptionTimelineClip";

export default function CaptionTrack({ scrollLeft, viewportWidth }: { scrollLeft: number; viewportWidth: number }) {
  const clips = useEditorStore((s) => s.doc.tracks.caption);
  const zoom = useEditorStore((s) => s.zoom);

  const visible = useMemo(() => {
    const startSec = scrollLeft / zoom;
    const endSec = (scrollLeft + viewportWidth) / zoom;
    const pad = 100 / zoom; // small buffer so clips don't pop in right at the viewport edge
    return clips.filter((c) => c.timelineStart + c.duration >= startSec - pad && c.timelineStart <= endSec + pad);
  }, [clips, scrollLeft, viewportWidth, zoom]);

  return (
    <div className="relative h-9 rounded-editor-sm bg-editor-elevated">
      {visible.map((clip) => (
        <CaptionTimelineClip key={clip.id} clip={clip} />
      ))}
    </div>
  );
}
