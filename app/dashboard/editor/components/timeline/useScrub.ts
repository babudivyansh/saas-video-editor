"use client";

// Press-and-drag seeking, shared by the ruler and the playhead head. Seeks on
// pointer-down and follows the pointer (captured, so leaving the strip keeps
// scrubbing). Playback pauses for the scrub — the clock and the pointer would
// otherwise fight over the playhead — and resumes on release if it was on.

import { useEffect, useMemo, useRef } from "react";
import type React from "react";
import { useEditorStore } from "../../store/editorStore";

export function useScrub(zoom: number, scrollRef: React.RefObject<HTMLDivElement | null>) {
  const state = useRef<{ resume: boolean } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  return useMemo(() => {
    const seekTo = (clientX: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const x = clientX - rect.left + scroller.scrollLeft;
      useEditorStore.getState().setCurrentTime(x / zoomRef.current);
    };
    const end = () => {
      const s = state.current;
      state.current = null;
      if (s?.resume) useEditorStore.getState().setPlaying(true);
    };
    const handlers = {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const st = useEditorStore.getState();
        state.current = { resume: st.playing };
        if (st.playing) st.setPlaying(false);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seekTo(e.clientX);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (state.current) seekTo(e.clientX);
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
    return { handlers, active: () => state.current !== null };
  }, [scrollRef]);
}
