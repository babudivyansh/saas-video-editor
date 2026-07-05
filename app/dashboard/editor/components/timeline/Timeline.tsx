"use client";

// Bottom timeline dock: toolbar + ruler + three track rows + playhead.
// Time↔pixel mapping is linear: x = t * zoom (px/second).

import React, { useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import TimeRuler from "./TimeRuler";
import TimelineTrack from "./TimelineTrack";
import Playhead from "./Playhead";
import EditToolbar from "../EditToolbar";

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
      {/* Toolbar: edit tools left, zoom right */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <EditToolbar />
        <div className="flex items-center gap-2">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(zoom - 20)}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <circle cx="11" cy="11" r="7" />
              <path d="M8 11h6M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
          <input
            type="range"
            min={10}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-24 accent-violet-500"
            aria-label="Timeline zoom"
          />
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(zoom + 20)}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <circle cx="11" cy="11" r="7" />
              <path d="M11 8v6M8 11h6M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
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
            <TimelineTrack kind="image" label="Image" />
            <TimelineTrack kind="text" label="Text" />
            <TimelineTrack kind="audio" label="Audio" />
          </div>
          <Playhead zoom={zoom} scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  );
}
