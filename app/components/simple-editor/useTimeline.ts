"use client";

import { useRef, useCallback } from "react";

interface UseTimelineOptions {
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onScrub?: (t: number) => void;
}

export function useTimeline({ duration, trimStart, trimEnd, onTrimChange, onScrub }: UseTimelineOptions) {
  const dragging = useRef<"start" | "end" | "scrub" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const posToTime = (clientX: number): number => {
    const el = containerRef.current;
    if (!el || duration === 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const t = posToTime(e.clientX);

    if (dragging.current === "start") {
      // Start handle can't exceed end − 1s
      const clamped = Math.max(0, Math.min(t, trimEnd - 1));
      onTrimChange(clamped, trimEnd);
      onScrub?.(clamped);
    } else if (dragging.current === "end") {
      // End handle can't go below start + 1s
      const clamped = Math.min(duration, Math.max(t, trimStart + 1));
      onTrimChange(trimStart, clamped);
      onScrub?.(clamped);
    } else if (dragging.current === "scrub") {
      onScrub?.(t);
    }
  }, [duration, trimStart, trimEnd, onTrimChange, onScrub]);

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const startDragHandle = useCallback((which: "start" | "end") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = which;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [onMouseMove, onMouseUp]);

  const startScrub = useCallback((e: React.MouseEvent) => {
    // Clicking on the bar background scrubs playhead (not on a handle)
    const t = posToTime(e.clientX);
    onScrub?.(t);
    dragging.current = "scrub";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [onMouseMove, onMouseUp, onScrub]);

  return { containerRef, startDragHandle, startScrub };
}
