"use client";
// Place the webcam overlay by hand for AutoClip's gaming layouts. With a box,
// the facecam layouts need no face tracking at all, and they frame exactly what
// the creator's overlay is rather than a guess built from one face.
//
// Drag the box to move it, drag its corner to resize. Arrow keys move it (Shift
// + arrows resize) for keyboard users. "Find it for me" clears the box, and the
// pipeline locates the webcam itself (face tracking or Gemini's scene labels),
// falling back to the full frame.

import { useCallback, useRef, useState } from "react";
import type { FacecamBox } from "@/lib/speaker-modes";

const CORNER_W = 0.24;
const CORNER_H = 0.3;
const MARGIN = 0.02;
const MIN = 0.05;

const CORNERS: { id: string; label: string; box: FacecamBox }[] = [
  { id: "tl", label: "Top left", box: { x: MARGIN, y: MARGIN, w: CORNER_W, h: CORNER_H } },
  { id: "tr", label: "Top right", box: { x: 1 - MARGIN - CORNER_W, y: MARGIN, w: CORNER_W, h: CORNER_H } },
  { id: "bl", label: "Bottom left", box: { x: MARGIN, y: 1 - MARGIN - CORNER_H, w: CORNER_W, h: CORNER_H } },
  { id: "br", label: "Bottom right", box: { x: 1 - MARGIN - CORNER_W, y: 1 - MARGIN - CORNER_H, w: CORNER_W, h: CORNER_H } },
];

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keeps a box inside the frame and at least MIN on each side. */
export function clampBox(b: FacecamBox): FacecamBox {
  const w = clamp(b.w, MIN, 1);
  const h = clamp(b.h, MIN, 1);
  return { x: round(clamp(b.x, 0, 1 - w)), y: round(clamp(b.y, 0, 1 - h)), w: round(w), h: round(h) };
}

export function FacecamBoxPicker({
  videoUrl,
  value,
  onChange,
  seekSec = 1,
}: {
  /** A playable URL of the source, or null (no preview: the corner buttons still work). */
  videoUrl: string | null;
  value: FacecamBox | null;
  onChange: (box: FacecamBox | null) => void;
  /** Where in the source to show a frame. */
  seekSec?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [videoFailed, setVideoFailed] = useState(false);
  const drag = useRef<{ kind: "move" | "resize"; startX: number; startY: number; box: FacecamBox } | null>(null);

  const onPointerDown = useCallback((kind: "move" | "resize") => (e: React.PointerEvent) => {
    if (!value) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, startX: e.clientX, startY: e.clientY, box: value };
  }, [value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || !frame) return;
    const rect = frame.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    onChange(clampBox(d.kind === "move"
      ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
      : { ...d.box, w: Math.min(1 - d.box.x, d.box.w + dx), h: Math.min(1 - d.box.y, d.box.h + dy) }));
  }, [onChange]);

  const endDrag = useCallback(() => { drag.current = null; }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!value) return;
    const step = 0.01;
    const k: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = k[e.key];
    if (!delta) return;
    e.preventDefault();
    onChange(clampBox(e.shiftKey
      ? { ...value, w: value.w + delta[0], h: value.h + delta[1] }
      : { ...value, x: value.x + delta[0], y: value.y + delta[1] }));
  }, [value, onChange]);

  // Clicking empty frame places a default-size box centred on the click.
  const onFrameClick = useCallback((e: React.MouseEvent) => {
    if (value) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    onChange(clampBox({ x: cx - CORNER_W / 2, y: cy - CORNER_H / 2, w: CORNER_W, h: CORNER_H }));
  }, [value, onChange]);

  const showVideo = !!videoUrl && !videoFailed;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-semibold text-fg">Where is your webcam?</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          {value ? "Drag the box over your facecam; drag its corner to resize." : "We'll find it for you. Or pick a corner, or click your webcam in the frame."}
        </p>
      </div>

      <div
        ref={frameRef}
        onClick={onFrameClick}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative w-full max-w-[520px] select-none overflow-hidden rounded-xl border border-line bg-black ${value ? "" : "cursor-crosshair"}`}
        style={{ aspectRatio: String(aspect) }}
      >
        {showVideo ? (
          <video
            src={`${videoUrl}#t=${seekSec}`}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight);
            }}
            onError={() => setVideoFailed(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-2 text-xs text-fg-muted">
            Preview not available, so pick a corner
          </div>
        )}

        {value && (
          <div
            role="slider"
            tabIndex={0}
            aria-label="Webcam position. Arrow keys move it, Shift and arrow keys resize it."
            aria-valuetext={`${Math.round(value.x * 100)}% from left, ${Math.round(value.y * 100)}% from top, ${Math.round(value.w * 100)}% wide`}
            aria-valuenow={Math.round(value.x * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown("move")}
            onClick={(e) => e.stopPropagation()}
            className="absolute cursor-move rounded-md border-2 border-emerald-bright bg-emerald-bright/15 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%`, width: `${value.w * 100}%`, height: `${value.h * 100}%` }}
          >
            <span className="absolute left-1 top-0.5 text-[10px] font-bold text-emerald-bright">Webcam</span>
            <span
              aria-hidden
              onPointerDown={onPointerDown("resize")}
              className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-bg bg-emerald-bright"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Webcam position presets">
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange(null)}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${!value ? "border-primary/50 bg-primary/10 text-primary" : "border-line text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
        >
          Find it for me
        </button>
        {CORNERS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.box)}
            className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
