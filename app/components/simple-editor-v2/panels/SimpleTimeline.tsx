"use client";

import { useRef, useCallback } from "react";
import { useSimpleEditorStore } from "../store/simpleEditorStore";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function SimpleTimeline() {
  const duration  = useSimpleEditorStore(s => s.videoDuration);
  const trimStart = useSimpleEditorStore(s => s.trimStart);
  const trimEnd   = useSimpleEditorStore(s => s.trimEnd);
  const setTrim   = useSimpleEditorStore(s => s.setTrim);

  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct   = duration > 0 ? (trimEnd   / duration) * 100 : 100;

  const getT = useCallback((clientX: number) => {
    if (!barRef.current || !duration) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  }, [duration]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const t = getT(e.clientX);
    if (dragging.current === "start") {
      setTrim(Math.min(t, trimEnd - 0.5), trimEnd);
    } else {
      setTrim(trimStart, Math.max(t, trimStart + 0.5));
    }
  }, [getT, trimStart, trimEnd, setTrim]);

  const stopDrag = () => { dragging.current = null; };

  if (!duration) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6b7280" }}>
          Trim
        </span>
        <span className="text-xs font-mono" style={{ color: "#9ca3af" }}>
          {fmt(trimStart)} → {fmt(trimEnd)} ({fmt(trimEnd - trimStart)})
        </span>
      </div>

      {/* Track bar */}
      <div
        ref={barRef}
        className="relative h-10 rounded-xl select-none cursor-pointer"
        style={{ background: "rgba(255,255,255,0.04)" }}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {/* Full waveform placeholder */}
        <div className="absolute inset-0 flex items-center gap-px px-1 overflow-hidden rounded-xl opacity-20">
          {Array.from({ length: 60 }, (_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: `${20 + Math.sin(i * 0.8) * 15 + Math.random() * 20}%`,
                background: "#7C3AED",
                minWidth: 2,
              }}
            />
          ))}
        </div>

        {/* Selected region */}
        <div
          className="absolute top-0 bottom-0 rounded-lg"
          style={{
            left:  `${startPct}%`,
            width: `${endPct - startPct}%`,
            background: "rgba(124,58,237,0.25)",
            border: "1px solid rgba(124,58,237,0.5)",
          }}
        />

        {/* Left trim handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center z-10"
          style={{ left: `calc(${startPct}% - 6px)` }}
          onMouseDown={() => { dragging.current = "start"; }}
        >
          <div className="w-3 h-8 rounded-full flex items-center justify-center" style={{ background: "#7C3AED" }}>
            <div className="w-0.5 h-4 rounded-full bg-white/60" />
          </div>
        </div>

        {/* Right trim handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center z-10"
          style={{ left: `calc(${endPct}% - 6px)` }}
          onMouseDown={() => { dragging.current = "end"; }}
        >
          <div className="w-3 h-8 rounded-full flex items-center justify-center" style={{ background: "#7C3AED" }}>
            <div className="w-0.5 h-4 rounded-full bg-white/60" />
          </div>
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-2">
        <span className="text-xs font-mono" style={{ color: "#4b5563" }}>0:00</span>
        <span className="text-xs font-mono" style={{ color: "#4b5563" }}>{fmt(duration)}</span>
      </div>
    </div>
  );
}
