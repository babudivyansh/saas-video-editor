"use client";

// Range selector under a time series.
//
// Built from two native range inputs rather than draggable SVG handles. That is
// not a shortcut: native inputs come with keyboard support, focus rings, screen
// reader announcement, and touch targets that already work — all of which a
// hand-rolled SVG brush would have to reimplement, and which the previous chart
// kit got wrong. The visual overlay is decoration on top of real controls.

import { useId } from "react";
import { fmtDateShort } from "./format";

export interface BrushRangeProps {
  /** Every selectable date, ascending. Indices into this are the values. */
  dates: string[];
  /** Selected window, as indices into `dates`. */
  value: { start: number; end: number };
  onChange: (next: { start: number; end: number }) => void;
  label?: string;
  className?: string;
}

export function BrushRange({
  dates,
  value,
  onChange,
  label = "Visible date range",
  className = "",
}: BrushRangeProps) {
  const startId = useId();
  const endId = useId();
  const last = dates.length - 1;

  if (dates.length < 2) return null;

  // The handles are clamped against each other rather than allowed to cross:
  // a crossed brush produces an inverted window, which every downstream filter
  // reads as "no data" — a confusing way to say "you dragged too far".
  const setStart = (next: number) => onChange({ start: Math.min(next, value.end), end: value.end });
  const setEnd = (next: number) => onChange({ start: value.start, end: Math.max(next, value.start) });

  const pct = (i: number) => (i / last) * 100;

  return (
    <div className={`mt-2 ${className}`}>
      <div className="mb-1 flex items-center justify-between text-[11px] text-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums">
          {fmtDateShort(dates[value.start])} – {fmtDateShort(dates[value.end])}
        </span>
      </div>

      <div className="relative h-8">
        {/* Track + selected span. Decoration: the inputs below carry the state. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-surface">
          <div
            className="absolute h-1 rounded-full bg-brand"
            style={{ left: `${pct(value.start)}%`, right: `${100 - pct(value.end)}%` }}
          />
        </div>

        <label className="sr-only" htmlFor={startId}>
          Range start
        </label>
        <input
          id={startId}
          type="range"
          min={0}
          max={last}
          value={value.start}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-valuetext={dates[value.start]}
          className="pointer-events-auto absolute inset-x-0 top-2 h-4 w-full appearance-none bg-transparent accent-[var(--brand)]"
        />

        <label className="sr-only" htmlFor={endId}>
          Range end
        </label>
        <input
          id={endId}
          type="range"
          min={0}
          max={last}
          value={value.end}
          onChange={(e) => setEnd(Number(e.target.value))}
          aria-valuetext={dates[value.end]}
          className="pointer-events-auto absolute inset-x-0 top-2 h-4 w-full appearance-none bg-transparent accent-[var(--brand)]"
        />
      </div>
    </div>
  );
}
