"use client";

// Tick ruler above the tracks. Tick spacing adapts to zoom so labels never crowd.

import React from "react";
import { useEditorStore } from "../../store/editorStore";

function tickInterval(zoom: number): number {
  // Aim for a label roughly every 80px.
  const targetSec = 80 / zoom;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const s of steps) if (s >= targetSec) return s;
  return 120;
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export default function TimeRuler({ totalSeconds, zoom }: { totalSeconds: number; zoom: number }) {
  const interval = tickInterval(zoom);
  const ticks: number[] = [];
  for (let t = 0; t <= totalSeconds + interval; t += interval) ticks.push(t);
  const markers = useEditorStore((s) => s.doc.markers);
  const removeMarker = useEditorStore((s) => s.removeMarker);

  return (
    <div className="relative h-6 cursor-pointer select-none border-b border-editor-border bg-editor-panel">
      {ticks.map((t) => (
        <div key={t} className="absolute bottom-0 top-0 flex items-end" style={{ left: t * zoom }}>
          <span className="h-2 w-px bg-editor-border-strong" />
          <span className="mb-0.5 ml-1 text-[9px] text-editor-text-faint">{fmt(Math.round(t * 100) / 100)}</span>
        </div>
      ))}
      {/* Markers (M toggles one at the playhead). Double-click removes one. */}
      {markers?.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.label ? `${m.label} · double-click to remove` : "Marker · double-click to remove"}
          aria-label={`Marker at ${m.t.toFixed(2)} s`}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={() => removeMarker(m.id)}
          className="absolute top-0 z-10 h-3 w-3 -translate-x-1/2 cursor-pointer rotate-45 rounded-[2px] border border-black/40 bg-warning"
          style={{ left: m.t * zoom }}
        />
      ))}
    </div>
  );
}
