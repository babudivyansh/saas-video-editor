"use client";
import { useCallback, useRef, useState } from "react";

// Before/after comparison: the edited image over the original, clipped at a
// handle the user drags. The range input underneath carries keyboard and
// screen-reader control; pointer drag on the image moves the same value.

export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={boxRef}
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-surface-1"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX); }}
        onPointerMove={(e) => { if (dragging.current) moveTo(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt}, before`} className="block max-h-[620px] w-full object-contain" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={after}
          alt={`${alt}, after`}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
          </span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">Before</span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-on-primary">After</span>
      </div>
      <label className="flex items-center gap-3 text-[12px] text-fg-subtle">
        <span className="sr-only">Compare before and after</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pos)}
          onChange={(e) => setPos(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-label="Compare before and after"
        />
      </label>
    </div>
  );
}
