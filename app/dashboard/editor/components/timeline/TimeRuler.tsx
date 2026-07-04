"use client";

// Tick ruler above the tracks. Tick spacing adapts to zoom so labels never crowd.

import React from "react";

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

  return (
    <div className="relative h-6 cursor-pointer select-none border-b border-zinc-800 bg-zinc-900">
      {ticks.map((t) => (
        <div key={t} className="absolute bottom-0 top-0 flex items-end" style={{ left: t * zoom }}>
          <span className="h-2 w-px bg-zinc-600" />
          <span className="mb-0.5 ml-1 text-[9px] text-zinc-500">{fmt(Math.round(t * 100) / 100)}</span>
        </div>
      ))}
    </div>
  );
}
