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
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const undoAction = useEditorStore((s) => s.undoAction);
  const redoAction = useEditorStore((s) => s.redoAction);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selection = useEditorStore((s) => s.selection);

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
    <div className="flex h-60 flex-shrink-0 flex-col border-t border-card-border bg-white">
      {/* Toolbar */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-card-border px-3">
        <div className="flex items-center gap-1">
          <ToolButton label="Undo (Ctrl+Z)" onClick={undoAction}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolButton>
          <ToolButton label="Redo (Ctrl+Y)" onClick={redoAction}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-card-border" />
          <ToolButton label="Split at playhead (S)" onClick={splitAtPlayhead}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <path d="M20 4L8 16M14.5 14.5L20 20M8 8l4 4" strokeLinecap="round" />
            </svg>
          </ToolButton>
          <ToolButton label="Delete selected (Del)" onClick={deleteSelected} disabled={!selection}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-card-border" />
          <button
            onClick={toggleSnap}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
              snapEnabled ? "bg-brand-soft text-brand-deep" : "text-ink-soft hover:text-ink"
            }`}
            title="Snap to clip edges"
          >
            Snap
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-soft">Zoom</span>
          <input
            type="range"
            min={10}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-28 accent-[#12d6a5]"
            aria-label="Timeline zoom"
          />
        </div>
      </div>

      {/* Scrollable track area */}
      <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
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

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40 cursor-pointer"
    >
      {children}
    </button>
  );
}
