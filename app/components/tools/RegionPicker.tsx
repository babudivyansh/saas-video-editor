"use client";

import { useRef, useState } from "react";

/** A box as fractions (0..1) of the displayed video frame. */
export interface FractionBox { x: number; y: number; w: number; h: number }

const PRESETS: ReadonlyArray<readonly [string, FractionBox]> = [
  ["Bottom band", { x: 0.04, y: 0.78, w: 0.92, h: 0.17 }],
  ["Middle band", { x: 0.04, y: 0.42, w: 0.92, h: 0.16 }],
  ["Top band", { x: 0.04, y: 0.05, w: 0.92, h: 0.15 }],
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Shows a video paused on a frame and lets the user drag boxes over the text
 * to remove (up to `max`). A scrubber picks the frame; preset bands add a box
 * without drawing, for keyboard users and quick starts.
 */
export function RegionPicker({ src, regions, onChange, max = 4, disabled }: {
  src: string;
  regions: FractionBox[];
  onChange: (next: FractionBox[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<FractionBox | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const full = regions.length >= max;

  const point = (e: React.PointerEvent) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): FractionBox =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  const onDown = (e: React.PointerEvent) => {
    if (disabled || full || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = point(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current) setDraft(boxFrom(start.current, point(e)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const box = boxFrom(start.current, point(e));
    start.current = null;
    setDraft(null);
    if (box.w >= 0.02 && box.h >= 0.02) onChange([...regions, box]);
  };

  const seek = (t: number) => {
    setTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-black">
        <div className="relative inline-block">
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDuration(Number.isFinite(d) ? d : 0); }}
            className="block max-h-[520px] max-w-full select-none"
          />
          <div
            ref={overlayRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => { start.current = null; setDraft(null); }}
            className={`absolute inset-0 touch-none ${full || disabled ? "cursor-default" : "cursor-crosshair"}`}
            aria-label="Drag over the captions to mark them"
          >
            {regions.map((r, i) => (
              <div key={i} className="absolute rounded-md border-2 border-primary bg-primary/15"
                   style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                {!disabled && (
                  <button type="button" onClick={() => onChange(regions.filter((_, j) => j !== i))}
                          aria-label={`Remove area ${i + 1}`}
                          className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-1 text-[11px] font-bold text-fg shadow ring-1 ring-line hover:bg-surface-3">
                    ×
                  </button>
                )}
              </div>
            ))}
            {draft && (
              <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-primary bg-primary/10"
                   style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />
            )}
          </div>
        </div>
      </div>

      {duration > 0 && (
        <label className="flex items-center gap-3 text-[12px] text-fg-muted">
          <span className="flex-shrink-0">Frame</span>
          <input type="range" min={0} max={duration} step={0.1} value={time} disabled={disabled}
                 onChange={(e) => seek(Number(e.target.value))} className="w-full accent-primary" aria-label="Pick a frame that shows the captions" />
          <span className="w-10 flex-shrink-0 text-right tabular-nums">{time.toFixed(1)}s</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([label, box]) => (
          <button key={label} type="button" disabled={disabled || full} onClick={() => onChange([...regions, box])}
                  className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-surface-3 disabled:opacity-50">
            + {label}
          </button>
        ))}
        {regions.length > 0 && !disabled && (
          <button type="button" onClick={() => onChange([])} className="ml-auto text-[12px] font-semibold text-fg-muted underline underline-offset-2 hover:text-fg">
            Clear all
          </button>
        )}
      </div>
      <p className="text-[12px] text-fg-subtle">
        {full ? `${max} areas marked — that's the most.` : `Drag a box over the captions. ${regions.length}/${max} marked. Each box is cleaned for the whole video.`}
      </p>
    </div>
  );
}
