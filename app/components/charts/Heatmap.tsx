"use client";

// Weekday x time-block heatmap, rendered as a REAL <table>.
//
// The previous version was a CSS grid of divs. Empty cells carried no label at
// all, and there was no table or grid semantic, so the whole structure was
// unreadable to a screen reader — you could hear individual cell values with no
// way to know which day or hour they belonged to. Row and column headers fix
// that for free.

import { fmtPct } from "./format";

export interface HeatmapCell {
  /** Row index into rowLabels. */
  row: number;
  /** Column index into colLabels. */
  col: number;
  value: number;
  /** Samples behind the value — a cell backed by one post is not a signal. */
  count: number;
}

export interface HeatmapProps {
  title: string;
  subtitle?: string;
  cells: HeatmapCell[];
  rowLabels: string[];
  colLabels: string[];
  /** Highlighted cell — the recommended slot. */
  best?: { row: number; col: number } | null;
  valueFmt?: (v: number) => string;
  /** Describes what a cell measures, e.g. "average engagement rate". */
  measure?: string;
}

export function Heatmap({
  title,
  subtitle,
  cells,
  rowLabels,
  colLabels,
  best,
  valueFmt = fmtPct,
  measure = "average engagement rate",
}: HeatmapProps) {
  const byKey = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));
  const max = cells.length > 0 ? Math.max(...cells.map((c) => c.value)) : 0;

  if (cells.length === 0) {
    return (
      <figure className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card">
        <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
        <p className="py-10 text-center text-sm text-ink-soft">
          Not enough posting history yet — publish a few more times and a pattern will appear.
        </p>
      </figure>
    );
  }

  return (
    <figure className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card">
      <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
      {subtitle && <p className="mt-0.5 mb-3 text-xs text-ink-soft">{subtitle}</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">
            {title}. Rows are days of the week, columns are time blocks, and each cell is the{" "}
            {measure}. Cells with no posts are marked as such.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sr-only">Day</th>
              {colLabels.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="pb-1 text-center text-xs font-medium text-ink-soft"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel, row) => (
              <tr key={rowLabel}>
                <th
                  scope="row"
                  className="pr-2 text-right text-xs font-medium text-ink-soft whitespace-nowrap"
                >
                  {rowLabel}
                </th>
                {colLabels.map((colLabel, col) => {
                  const cell = byKey.get(`${row}:${col}`);
                  const isBest = best?.row === row && best?.col === col;
                  // Single-hue opacity ramp: intensity encodes magnitude, and a
                  // floor keeps the lowest non-zero cell visible.
                  const alpha = cell && max > 0 ? 0.12 + (cell.value / max) * 0.78 : 0;

                  return (
                    <td
                      key={colLabel}
                      className={`h-8 rounded text-center align-middle ${
                        isBest ? "ring-2 ring-brand" : ""
                      }`}
                      style={{
                        background: cell ? `rgba(51, 92, 255, ${alpha.toFixed(3)})` : "var(--surface)",
                      }}
                    >
                      {cell ? (
                        <span className="sr-only">
                          {valueFmt(cell.value)} from {cell.count} {cell.count === 1 ? "post" : "posts"}
                          {isBest ? " — best time to post" : ""}
                        </span>
                      ) : (
                        <span className="sr-only">No posts published in this slot</span>
                      )}
                      {/*
                        The label sits ON the fill, whose alpha runs 0 to 1, so
                        a single colour cannot stay readable across the scale —
                        grey on a saturated cell was the worst case. Flip to
                        white once the fill is dark enough to carry it.
                      */}
                      <span
                        aria-hidden="true"
                        className={`text-[0.6875rem] font-semibold ${
                          alpha >= 0.55 ? "text-white" : "text-ink"
                        }`}
                      >
                        {cell && cell.count >= 2 ? valueFmt(cell.value) : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        Darker means stronger {measure}. Values are shown only where at least two posts back them up.
      </p>
    </figure>
  );
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Six four-hour blocks, matching computeBestTimes. */
export const BLOCK_LABELS = ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"];
