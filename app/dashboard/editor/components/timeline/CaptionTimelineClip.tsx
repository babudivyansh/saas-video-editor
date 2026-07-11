"use client";

// A lightweight caption cue block on the timeline — click to select, drag
// body to move (push-past-neighbor via moveCaptionClipTransient), drag edges
// to trim. Deliberately NOT built on TimelineClip.tsx: no hover toolbar (bulk
// ops — rename/delete/lock/hide/merge — live in the left panel's Caption
// List instead), no thumbnails, no rename-input state. A video with hundreds
// of cues needs this row to stay cheap to mount, not carry the same
// always-present chrome a handful of video/text/audio/image clips can afford.

import React, { useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { snapCandidates, snapTime } from "@/lib/editor/doc-utils";
import type { CaptionClip, TimelineDoc } from "@/lib/editor/types";

const SNAP_PX = 8;
type DragMode = "move" | "trim-left" | "trim-right";

export default function CaptionTimelineClip({ clip }: { clip: CaptionClip }) {
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

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    select({ clipId: clip.id, track: "caption" });
    if (clip.locked) return;
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
        const snappedStart = snapTime(newStart, candidates, tolerance);
        const snappedEnd = snapTime(newStart + d.origDuration, candidates, tolerance);
        if (snappedStart !== newStart) newStart = snappedStart;
        else if (snappedEnd !== newStart + d.origDuration) newStart = snappedEnd - d.origDuration;
      }
      s.moveCaptionClipTransient(clip.id, newStart);
    } else if (d.mode === "trim-left") {
      let t = d.origStart + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient("caption", clip.id, "left", t);
    } else {
      let t = d.origStart + d.origDuration + deltaSec;
      if (tolerance) t = snapTime(t, candidates, tolerance);
      s.trimClipTransient("caption", clip.id, "right", t);
    }
  };

  const onPointerUp = () => {
    if (drag.current) {
      useEditorStore.getState().commitDrag(drag.current.before);
      drag.current = null;
    }
  };

  return (
    <div
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute bottom-0.5 top-0.5 flex touch-none items-center overflow-hidden rounded-editor-sm border border-editor-track-caption bg-editor-track-caption/80 transition-shadow ${
        clip.locked ? "cursor-default" : "cursor-grab"
      } ${clip.hidden ? "opacity-40" : ""} ${selected ? "ring-2 ring-editor-accent shadow-editor-glow" : ""}`}
      style={{ left: clip.timelineStart * zoom, width: Math.max(clip.duration * zoom, 8) }}
    >
      {!clip.locked && (
        <span
          onPointerDown={(e) => beginDrag(e, "trim-left")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="group absolute inset-y-0 left-0 flex w-2 cursor-ew-resize touch-none items-center justify-center"
          aria-label="Trim start"
        >
          <span className="h-1/2 w-1 rounded-full bg-white/60 opacity-40 transition-opacity group-hover:opacity-100" />
        </span>
      )}
      <span className="pointer-events-none truncate px-2 text-[10px] font-semibold text-zinc-900">
        {clip.name || clip.text || "Caption"}
      </span>
      {!clip.locked && (
        <span
          onPointerDown={(e) => beginDrag(e, "trim-right")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="group absolute inset-y-0 right-0 flex w-2 cursor-ew-resize touch-none items-center justify-center"
          aria-label="Trim end"
        >
          <span className="h-1/2 w-1 rounded-full bg-white/60 opacity-40 transition-opacity group-hover:opacity-100" />
        </span>
      )}
    </div>
  );
}
