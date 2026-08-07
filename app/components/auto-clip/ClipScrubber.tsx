"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// A compact scrubber for one clip: waveform, playhead, and drag handles for
// the in/out points.
//
// Deliberately NOT the editor's Timeline components. Those are hard-bound to
// the global editorStore singleton and mutate a TimelineDoc — mounting them in
// a drawer risks a stale doc leaking in from a previous editor session, and
// they solve problems this surface does not have (multiple tracks, drag-to-
// place, multi-select). This reuses the maths and draws one lane.

export interface ClipScrubberProps {
  /** Waveform peaks (0..1), generated server-side during render. */
  peaks: number[];
  durationSec: number;
  startSec: number;
  endSec: number;
  /** Clip-relative playhead position, if a preview is playing. */
  playheadSec?: number;
  onChange: (next: { startSec: number; endSec: number }) => void;
  onSeek?: (sec: number) => void;
  disabled?: boolean;
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 10))}`;
}

export function ClipScrubber({
  peaks, durationSec, startSec, endSec, playheadSec, onChange, onSeek, disabled,
}: ClipScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const pct = useCallback((sec: number) => (durationSec > 0 ? (sec / durationSec) * 100 : 0), [durationSec]);

  const secAtClientX = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el || durationSec <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * durationSec;
  }, [durationSec]);

  // Pointer move/up live on window so a drag that leaves the track still
  // tracks, and still ends, instead of sticking.
  useEffect(() => {
    if (!dragging) return;
    const MIN_CLIP_SEC = 1;

    const move = (e: PointerEvent) => {
      const sec = secAtClientX(e.clientX);
      if (dragging === "start") {
        onChange({ startSec: Math.min(sec, endSec - MIN_CLIP_SEC), endSec });
      } else {
        onChange({ startSec, endSec: Math.max(sec, startSec + MIN_CLIP_SEC) });
      }
    };
    const up = () => setDragging(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, endSec, startSec, onChange, secAtClientX]);

  const bars = peaks.length > 0 ? peaks : new Array(80).fill(0.12);

  return (
    <div className="space-y-1.5">
      <div
        ref={trackRef}
        className={`relative h-16 rounded-lg bg-gray-100 overflow-hidden select-none ${disabled ? "opacity-50" : "cursor-pointer"}`}
        onPointerDown={(e) => {
          if (disabled || dragging) return;
          onSeek?.(secAtClientX(e.clientX));
        }}
      >
        {/* Waveform */}
        <div className="absolute inset-0 flex items-center gap-px px-px" aria-hidden="true">
          {bars.map((p, i) => {
            const t = durationSec * (i / bars.length);
            const inRange = t >= startSec && t <= endSec;
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-colors ${inRange ? "bg-brand/70" : "bg-gray-300"}`}
                style={{ height: `${Math.max(6, Math.min(100, p * 100))}%` }}
              />
            );
          })}
        </div>

        {/* Excluded regions */}
        <div className="absolute inset-y-0 left-0 bg-white/65 pointer-events-none" style={{ width: `${pct(startSec)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-white/65 pointer-events-none" style={{ width: `${100 - pct(endSec)}%` }} />

        {/* Trim handles */}
        {(["start", "end"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            disabled={disabled}
            aria-label={edge === "start" ? "Trim start" : "Trim end"}
            onPointerDown={(e) => { e.stopPropagation(); if (!disabled) setDragging(edge); }}
            className="absolute inset-y-0 w-3 -ml-1.5 flex items-center justify-center cursor-ew-resize touch-none disabled:cursor-not-allowed"
            style={{ left: `${pct(edge === "start" ? startSec : endSec)}%` }}
          >
            <span className="h-full w-1 rounded-full bg-brand shadow" />
          </button>
        ))}

        {playheadSec != null && (
          <div className="absolute inset-y-0 w-px bg-gray-900 pointer-events-none" style={{ left: `${pct(playheadSec)}%` }} />
        )}
      </div>

      <div className="flex justify-between text-[10px] font-mono text-ink-soft">
        <span>{fmt(startSec)}</span>
        <span>{fmt(Math.max(0, endSec - startSec))} selected</span>
        <span>{fmt(endSec)}</span>
      </div>
    </div>
  );
}
