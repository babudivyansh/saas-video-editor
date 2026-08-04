"use client";

// Horizontal bars comparing categories — us vs competitors, platform vs
// platform, media type vs media type.
//
// Horizontal because the labels are words, not dates: a vertical bar chart with
// "@somebodys_long_handle" under each column either truncates or rotates, and
// both are worse than simply turning the chart on its side.

import { ChartFrame, type ChartFrameProps, type ChartSeriesMeta } from "./ChartFrame";
import { fmtByUnit } from "./format";

export interface ComparisonBarsProps extends Omit<ChartFrameProps, "children" | "xLabel" | "formatX"> {
  /** Marks a bar as "this is you" — rendered filled, the rest tinted. */
  highlightKey?: string;
  categoryLabel?: string;
}

/**
 * Series are the CATEGORIES here (one bar each), and each carries a single
 * point whose `date` is the category label. That keeps ChartFrame's legend,
 * empty state and sr-only table working unchanged.
 */
export function ComparisonBars({
  highlightKey,
  categoryLabel = "Category",
  ...frame
}: ComparisonBarsProps) {
  const bars = frame.series
    .map((s) => ({ meta: s, value: s.points[0]?.value ?? null, label: s.points[0]?.date ?? s.label }))
    .filter((b): b is { meta: ChartSeriesMeta; value: number; label: string } => b.value !== null);

  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 0) || 1;

  return (
    <ChartFrame {...frame} xLabel={categoryLabel} formatX={(v) => v}>
      <ul className="space-y-2.5">
        {bars.map(({ meta, value, label }) => {
          const isMine = highlightKey !== undefined && meta.key === highlightKey;
          return (
            <li key={meta.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className={`truncate ${isMine ? "font-semibold text-ink" : "text-ink-soft"}`}>
                  {label}
                  {isMine && <span className="sr-only"> (your account)</span>}
                </span>
                <span className="flex-shrink-0 font-semibold tabular-nums text-ink">
                  {fmtByUnit(value, meta.unit)}
                </span>
              </div>
              {/* aria-hidden: the value is already in the text above and in the
                  frame's data table. A second announcement per bar is noise. */}
              <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(Math.abs(value) / max) * 100}%`,
                    background: meta.color,
                    opacity: highlightKey === undefined || isMine ? 1 : 0.45,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
