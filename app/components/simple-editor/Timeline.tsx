"use client";

import { useRef } from "react";
import type { TrimRange } from "./types";
import { useTimeline } from "./useTimeline";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  duration: number;
  currentTime: number;
  trim: TrimRange;
  onTrimChange: (t: TrimRange) => void;
  onScrub: (t: number) => void;
  onPlaySelection: () => void;
}

export default function Timeline({ duration, currentTime, trim, onTrimChange, onScrub, onPlaySelection }: Props) {
  const { containerRef, startDragHandle, startScrub } = useTimeline({
    duration,
    trimStart: trim.start,
    trimEnd: trim.end,
    onTrimChange: (start, end) => onTrimChange({ start, end }),
    onScrub,
  });

  const leftPct = (trim.start / duration) * 100;
  const rightPct = (trim.end / duration) * 100;
  const playheadPct = (currentTime / duration) * 100;

  if (duration === 0) {
    return (
      <div className="h-14 bg-[#111118] rounded-xl mx-4 animate-pulse" />
    );
  }

  return (
    <div className="px-4 space-y-1.5">
      {/* Timeline bar */}
      <div
        ref={containerRef}
        className="relative h-8 rounded-xl bg-white/5 cursor-pointer select-none"
        onMouseDown={startScrub}
        role="slider"
        aria-label="Timeline"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
      >
        {/* Darkened out-of-selection regions */}
        <div className="absolute top-0 left-0 h-full bg-black/40 rounded-l-xl pointer-events-none"
          style={{ width: `${leftPct}%` }} />
        <div className="absolute top-0 right-0 h-full bg-black/40 rounded-r-xl pointer-events-none"
          style={{ width: `${100 - rightPct}%` }} />

        {/* Selected region */}
        <div className="absolute top-0 h-full bg-[#7C3AED]/30 pointer-events-none"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }} />

        {/* Start handle */}
        <div
          className="absolute top-0 h-full w-2 bg-[#7C3AED] rounded-l cursor-ew-resize z-10 hover:bg-[#6d28d9]"
          style={{ left: `${leftPct}%` }}
          onMouseDown={e => { e.stopPropagation(); startDragHandle("start")(e); }}
          aria-label="Trim start handle"
        />

        {/* End handle */}
        <div
          className="absolute top-0 h-full w-2 bg-[#7C3AED] rounded-r cursor-ew-resize z-10 hover:bg-[#6d28d9]"
          style={{ left: `calc(${rightPct}% - 8px)` }}
          onMouseDown={e => { e.stopPropagation(); startDragHandle("end")(e); }}
          aria-label="Trim end handle"
        />

        {/* Playhead */}
        <div className="absolute top-0 h-full w-0.5 bg-white/90 z-20 pointer-events-none"
          style={{ left: `${playheadPct}%` }} />
        <div className="absolute -top-1.5 w-3 h-3 rounded-full bg-white shadow z-20 pointer-events-none -translate-x-1/2"
          style={{ left: `${playheadPct}%` }} />
      </div>

      {/* Timecodes + Play Selection */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{fmt(0)}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[#7C3AED]">In: {fmt(trim.start)}</span>
          <button
            onClick={onPlaySelection}
            className="px-3 py-1 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 text-[#7C3AED] font-semibold transition-colors"
          >
            ▶ Play selection
          </button>
          <span className="font-mono text-[#7C3AED]">Out: {fmt(trim.end)}</span>
        </div>
        <span className="text-gray-500">{fmt(duration)}</span>
      </div>
    </div>
  );
}
