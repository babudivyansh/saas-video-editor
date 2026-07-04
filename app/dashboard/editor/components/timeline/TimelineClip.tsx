"use client";

// A clip block on a track: click to select, drag body to move, drag the
// left/right handles to trim. Pointer-capture drag pattern (same approach the
// cut-and-crop tool uses); per-frame changes go through the store's transient
// actions and the whole gesture commits as one undo step on pointer-up.

import React, { useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { snapCandidates, snapTime } from "@/lib/editor/doc-utils";
import type { AnyClip, TimelineDoc, TrackKind } from "@/lib/editor/types";

const TRACK_COLORS: Record<TrackKind, { bg: string; border: string; text: string }> = {
  video: { bg: "bg-violet-600/70", border: "border-violet-400", text: "text-white" },
  text: { bg: "bg-amber-400/80", border: "border-amber-300", text: "text-zinc-900" },
  audio: { bg: "bg-emerald-400/80", border: "border-emerald-300", text: "text-zinc-900" },
};

const SNAP_PX = 8;

type DragMode = "move" | "trim-left" | "trim-right";

export default function TimelineClip({ clip, track }: { clip: AnyClip; track: TrackKind }) {
  const zoom = useEditorStore((s) => s.zoom);
  const selected = useEditorStore((s) => s.selection?.clipId === clip.id);
  const select = useEditorStore((s) => s.select);

  const drag = useRef<{
    mode: DragMode;
    startX: number;
    origStart: number;
    origDuration: number;
    before: TimelineDoc;
  } | null>(null);

  const label =
    clip.type === "text" ? clip.text || "Text" : clip.type === "video" ? "Video" : "Audio";

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    select({ clipId: clip.id, track });
    drag.current = {
      mode,
      startX: e.clientX,
      origStart: clip.timelineStart,
      origDuration: clip.duration,
      before: structuredClone(useEditorStore.getState().doc),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useEditorStore.getState();
    const deltaSec = (e.clientX - d.startX) / zoom;
    const tolerance = s.snapEnabled ? SNAP_PX / zoom : 0;
    const candidates = s.snapEnabled ? [...snapCandidates(s.doc, clip.id), s.currentTime] : [];

    if (d.mode === "move") {
      let newStart = Math.max(0, d.origStart + deltaSec);
      if (tolerance) {
        // Snap either edge of the moving clip.
        const snappedStart = snapTime(newStart, candidates, tolerance);
        const snappedEnd = snapTime(newStart + d.origDuration, candidates, tolerance);
        if (snappedStart !== newStart) newStart = snappedStart;
        else if (snappedEnd !== newStart + d.origDuration) newStart = snappedEnd - d.origDuration;
      }
      if (track === "video") s.moveVideoClipTransient(clip.id, newStart);
      else s.moveOverlayClipTransient(track as "text" | "audio", clip.id, newStart);
    } else if (d.mode === "trim-left") {
      let t = d.origStart + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient(track, clip.id, "left", t);
    } else {
      let t = d.origStart + d.origDuration + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient(track, clip.id, "right", t);
    }
  };

  const onPointerUp = () => {
    if (drag.current) {
      useEditorStore.getState().commitDrag(drag.current.before);
      drag.current = null;
    }
  };

  const colors = TRACK_COLORS[track];

  return (
    <div
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute bottom-0.5 top-0.5 flex cursor-grab touch-none items-center overflow-hidden rounded-md border ${colors.bg} ${colors.border} ${
        selected ? "ring-2 ring-white" : ""
      }`}
      style={{ left: clip.timelineStart * zoom, width: Math.max(clip.duration * zoom, 8) }}
    >
      {/* Left trim handle */}
      <span
        onPointerDown={(e) => beginDrag(e, "trim-left")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none bg-black/20 opacity-0 transition-opacity hover:opacity-100"
        aria-label="Trim start"
      />
      <span className={`pointer-events-none truncate px-2.5 text-[10px] font-semibold ${colors.text}`}>{label}</span>
      {/* Right trim handle */}
      <span
        onPointerDown={(e) => beginDrag(e, "trim-right")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-black/20 opacity-0 transition-opacity hover:opacity-100"
        aria-label="Trim end"
      />
    </div>
  );
}
