"use client";

// Playhead line + drag head. Position updates via a rAF-driven transform on a
// ref (no React re-render per frame); dragging seeks the store clock. While
// playing, the track area scrolls to keep the playhead in view.

import React, { useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useScrub } from "./useScrub";

/** While playing, page the view once the playhead is this close to the right edge. */
const FOLLOW_EDGE_PX = 40;

export default function Playhead({
  zoom,
  scrollRef,
}: {
  zoom: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const scrub = useScrub(zoom, scrollRef);

  // Follow the store clock without re-rendering per frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = lineRef.current;
      if (el) {
        const { currentTime: t, playing } = useEditorStore.getState();
        const x = t * zoom;
        el.style.transform = `translateX(${x}px)`;
        const scroller = scrollRef.current;
        if (playing && scroller && !scrub.active()) {
          const left = scroller.scrollLeft;
          const right = left + scroller.clientWidth;
          // Ran off the right edge → page forward; behind the view (the
          // rewind at the end, or a seek) → bring it back into view.
          if (x > right - FOLLOW_EDGE_PX || x < left) scroller.scrollLeft = Math.max(0, x - FOLLOW_EDGE_PX);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoom, scrollRef, scrub]);

  return (
    <div ref={lineRef} className="pointer-events-none absolute bottom-0 top-0 left-0 z-10 w-0">
      <div
        className="pointer-events-auto absolute -top-0 -left-[7px] h-3.5 w-3.5 cursor-ew-resize touch-none rounded-t-full rounded-b-sm bg-editor-accent shadow-editor-glow"
        {...scrub.handlers}
        aria-hidden="true"
      />
      <div className="absolute top-0 bottom-0 w-px bg-editor-accent" />
    </div>
  );
}
