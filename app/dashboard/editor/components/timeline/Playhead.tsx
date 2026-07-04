"use client";

// Playhead line + drag head. Position updates via a rAF-driven transform on a
// ref (no React re-render per frame); dragging seeks the store clock.

import React, { useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";

export default function Playhead({
  zoom,
  scrollRef,
}: {
  zoom: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Follow the store clock without re-rendering per frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = lineRef.current;
      if (el) {
        const t = useEditorStore.getState().currentTime;
        el.style.transform = `translateX(${t * zoom}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoom]);

  const seekTo = (clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = clientX - rect.left + scroller.scrollLeft;
    useEditorStore.getState().setCurrentTime(Math.max(0, x / zoom));
  };

  return (
    <div ref={lineRef} className="pointer-events-none absolute bottom-0 top-0 left-0 z-10 w-0">
      <div
        className="pointer-events-auto absolute -left-[7px] -top-0 h-3.5 w-3.5 cursor-ew-resize touch-none rounded-b-sm rounded-t-full bg-brand-deep"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => dragging.current && seekTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        aria-label="Playhead"
      />
      <div className="absolute bottom-0 top-0 w-px bg-brand-deep" />
    </div>
  );
}
