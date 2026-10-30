"use client";

// Lets the user place the captions by hand on a StudioPreview: press and hold
// the caption (or just drag it with a mouse) and move it anywhere in the
// frame; tap it to switch between a small and a large caption. Arrow keys
// move it and Enter resizes it, for keyboards.
//
// The layer is one button over the whole frame. It finds the caption the
// renderer drew (data-caption-block) to know what was grabbed, and reports
// the block centre as % of the frame — CaptionStyleOverride positionX /
// positionY, which the export reads too.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** How long a touch must rest on the caption before it lifts. */
const HOLD_MS = 250;
/** Movement that turns a mouse press into a drag, or cancels a touch hold. */
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 10;
/** The export keeps a block between 8% and 80% of the frame height (engine/layout.ts). */
const TOP_LIMIT = 8;
const BOTTOM_LIMIT = 80;

type Box = { x: number; y: number; w: number; h: number };

export interface CaptionDragLayerProps {
  frameRef: React.RefObject<HTMLDivElement | null>;
  /** Moves the block centre (% of frame width / height). */
  onMove: (pos: { x: number; y: number }) => void;
  /** A tap (or Enter) on the caption. */
  onToggleSize: () => void;
}

export function CaptionDragLayer({ frameRef, onMove, onToggleSize }: CaptionDragLayerProps) {
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const press = useRef<{ id: number; x: number; y: number; touch: boolean; grabX: number; grabY: number; timer: number | null; moved: boolean } | null>(null);
  const tapped = useRef(false);

  /** The caption's box in frame pixels, if one is on screen. */
  const measure = (): { frame: DOMRect; box: Box } | null => {
    const frameEl = frameRef.current;
    const cap = frameEl?.querySelector<HTMLElement>("[data-caption-block]");
    if (!frameEl || !cap) return null;
    const f = frameEl.getBoundingClientRect();
    const r = cap.getBoundingClientRect();
    return { frame: f, box: { x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height } };
  };
  const hit = (b: Box, x: number, y: number, pad = 12) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

  const moveTo = (frame: DOMRect, cx: number, cy: number, h: number) => {
    const halfH = (h / frame.height) * 50;
    const x = Math.min(95, Math.max(5, (cx / frame.width) * 100));
    const y = Math.min(BOTTOM_LIMIT - halfH, Math.max(TOP_LIMIT + halfH, (cy / frame.height) * 100));
    onMove({ x: Math.round(x * 10) / 10, y: Math.round(Math.min(95, Math.max(5, y)) * 10) / 10 });
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    tapped.current = false;
    const m = measure();
    if (!m) return;
    const px = e.clientX - m.frame.left;
    const py = e.clientY - m.frame.top;
    if (!hit(m.box, px, py)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const touch = e.pointerType !== "mouse";
    const state = {
      id: e.pointerId, x: e.clientX, y: e.clientY, touch, moved: false,
      grabX: px - (m.box.x + m.box.w / 2), grabY: py - (m.box.y + m.box.h / 2),
      timer: null as number | null,
    };
    state.timer = window.setTimeout(() => { setDragging(true); state.timer = null; }, HOLD_MS);
    press.current = state;
    setBox(m.box);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    const m = measure();
    if (!p || p.id !== e.pointerId) {
      // Hover: outline the caption so it reads as something to grab.
      if (e.pointerType === "mouse" && m) setBox(hit(m.box, e.clientX - m.frame.left, e.clientY - m.frame.top) ? m.box : null);
      return;
    }
    const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (!dragging) {
      if (!p.touch && dist > MOUSE_SLOP) {
        if (p.timer) window.clearTimeout(p.timer);
        p.timer = null;
        setDragging(true);
      } else if (p.touch && p.timer && dist > TOUCH_SLOP) {
        // Moved before the hold finished: not a drag, not a tap.
        window.clearTimeout(p.timer);
        press.current = null;
        setBox(null);
        return;
      } else {
        return;
      }
    }
    p.moved = true;
    if (!m) return;
    moveTo(m.frame, e.clientX - m.frame.left - p.grabX, e.clientY - m.frame.top - p.grabY, m.box.h);
    setBox(m.box);
  };

  const end = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.timer) window.clearTimeout(p.timer);
    // Lifted without moving: a tap (a hold that was never dragged is one too).
    tapped.current = !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= (p.touch ? TOUCH_SLOP : MOUSE_SLOP);
    press.current = null;
    setDragging(false);
    // A mouse still hovers the caption: outline where it landed (after this
    // move has rendered). A finger has left.
    if (e.pointerType === "mouse") requestAnimationFrame(() => setBox(measure()?.box ?? null));
    else setBox(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const m = measure();
    if (!m) return;
    const cx = m.box.x + m.box.w / 2 + (d[0] / 100) * m.frame.width;
    const cy = m.box.y + m.box.h / 2 + (d[1] / 100) * m.frame.height;
    moveTo(m.frame, cx, cy, m.box.h);
  };

  return (
    <button
      type="button"
      aria-label="Caption position. Drag the caption to move it, tap it to make it smaller or bigger. Arrow keys move it, Enter resizes it."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={(e) => { if (!press.current && e.pointerType === "mouse") setBox(null); }}
      onClick={(e) => {
        // Keyboard activation has no pointer (detail 0); a pointer counts only as a tap on the caption.
        if (e.detail === 0 || tapped.current) onToggleSize();
        tapped.current = false;
      }}
      onKeyDown={onKeyDown}
      className={`absolute inset-0 z-10 touch-none select-none rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70 ${
        dragging ? "cursor-grabbing" : box ? "cursor-grab" : "cursor-default"
      }`}
    >
      {box && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-md border-[1.5px] border-dashed ${dragging ? "border-info bg-info/10" : "border-info/70"}`}
          style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12 }}
        />
      )}
    </button>
  );
}
