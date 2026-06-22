"use client";

import type { Marker } from "@/lib/track-editor-types";

interface Props {
  zoom: number;
  duration: number;
  markers: Marker[];
}

export default function TimelineRuler({ zoom, duration, markers }: Props) {
  const step = zoom >= 200 ? 0.5 : zoom >= 80 ? 1 : zoom >= 40 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + step; t += step) {
    ticks.push(parseFloat(t.toFixed(3)));
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m > 0) return `${m}:${String(Math.floor(sec)).padStart(2, "0")}`;
    return `${sec.toFixed(step < 1 ? 1 : 0)}s`;
  }

  return (
    <div className="relative w-full h-full select-none">
      {ticks.map(t => {
        const x = t * zoom;
        const isMain = t % (step * 5) < 0.001;
        return (
          <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: x }}>
            <div
              className="w-px"
              style={{
                height: isMain ? 10 : 5,
                background: isMain ? "#3f3f46" : "#27272a",
                marginTop: isMain ? 18 : 23,
              }}
            />
            {isMain && (
              <span
                className="absolute text-[9px] top-1 whitespace-nowrap"
                style={{ color: "#52525b", transform: "translateX(-50%)" }}
              >
                {fmt(t)}
              </span>
            )}
          </div>
        );
      })}
      {/* Markers */}
      {markers.map(m => (
        <div
          key={m.id}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: m.time * zoom }}
          title={m.label || "Marker"}
        >
          <div className="w-0 h-0" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `8px solid ${m.color}` }} />
        </div>
      ))}
    </div>
  );
}
