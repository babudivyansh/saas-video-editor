"use client";

import { useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";

interface Props {
  zoom: number;
  rulerHeight: number;
  totalHeight: number;
}

export default function PlayheadMarker({ zoom, rulerHeight, totalHeight }: Props) {
  const currentTime = useEditorStore(s => s.currentTime);
  const duration = useEditorStore(s => s.duration);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const setIsPlaying = useEditorStore(s => s.setIsPlaying);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startTime = useRef(0);

  const x = currentTime * zoom;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startTime.current = currentTime;
    setIsPlaying(false);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [currentTime, setIsPlaying]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = (e.clientX - startX.current) / zoom;
    const t = Math.max(0, Math.min(duration, startTime.current + delta));
    setCurrentTime(t);
  }, [zoom, duration, setCurrentTime]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="absolute top-0 z-20 pointer-events-none"
      style={{ left: x, width: 1, height: totalHeight }}
    >
      {/* Vertical line */}
      <div className="w-px h-full" style={{ background: "#ef4444", opacity: 0.85 }} />
      {/* Draggable head */}
      <div
        className="absolute -top-0 pointer-events-auto cursor-col-resize"
        style={{ left: -8, width: 17 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Triangle head */}
        <div
          className="mx-auto"
          style={{
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: `${rulerHeight}px solid #ef4444`,
          }}
        />
      </div>
    </div>
  );
}
