"use client";

// Bottom timeline dock: toolbar + ruler + three track rows + playhead.
// Time↔pixel mapping is linear: x = t * zoom (px/second).

import React, { useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import TimeRuler from "./TimeRuler";
import TimelineTrack from "./TimelineTrack";
import Playhead from "./Playhead";

export default function Timeline() {
  const doc = useEditorStore((s) => s.doc);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  const scrollRef = useRef<HTMLDivElement>(null);

  const total = Math.max(docDuration(doc), 10);
  const contentWidth = total * zoom + 240; // trailing space to drop clips into

  const seekFromEvent = (e: React.MouseEvent) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = e.clientX - rect.left + scroller.scrollLeft;
    setCurrentTime(Math.max(0, x / zoom));
  };

  return (
    <div className="flex h-60 flex-shrink-0 flex-col border-t border-zinc-800 bg-zinc-900">
      {/* Zoom bar */}
      <div className="flex h-10 flex-shrink-0 items-center justify-end border-b border-zinc-800 px-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">Zoom</span>
          <input
            type="range"
            min={10}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-28 accent-violet-500"
            aria-label="Timeline zoom"
          />
        </div>
      </div>

      {/* Scrollable track area */}
      <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden bg-zinc-950">
        <div className="relative" style={{ width: contentWidth, minWidth: "100%" }}>
          <div onMouseDown={seekFromEvent}>
            <TimeRuler totalSeconds={total} zoom={zoom} />
          </div>
          <div className="flex flex-col gap-1 py-1">
            <TimelineTrack kind="video" label="Video" />
            <TimelineTrack kind="text" label="Text" />
            <TimelineTrack kind="audio" label="Audio" />
          </div>
          <Playhead zoom={zoom} scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  );
}
