"use client";

// The shell every chart wraps in: title, legend, export menu, empty and loading
// states, and — the part that matters — the screen-reader data table.
//
// That sr-only <table> is the main reason this kit exists rather than recharts.
// No mainstream chart library ships an equivalent, so adopting one would mean
// paying ~100 kB of d3 AND still writing the accessible layer by hand. Putting
// it in the frame means no chart can be added without one.

import type { ReactNode } from "react";
import { fmtByUnit, fmtDateLong, type ValueUnit } from "./format";

export interface ChartSeriesMeta {
  key: string;
  label: string;
  color: string;
  unit: ValueUnit;
  points: Array<{ date: string; value: number }>;
  style?: "solid" | "dashed";
}

export interface ChartFrameProps {
  title: string;
  subtitle?: string;
  series: ChartSeriesMeta[];
  /** Rendered inside the card, below the header. */
  children: ReactNode;
  /** Shown instead of children when there is nothing to plot. */
  emptyHint?: string;
  loading?: boolean;
  /** Actions slot — export menu, range chips. */
  actions?: ReactNode;
  className?: string;
  /** Instructions node id, wired to the plot via aria-describedby. */
  describedById?: string;
  /**
   * Header for the data table's first column. Defaults to "Date" — categorical
   * charts (donut, funnel, comparison bars) pass their own, because a table
   * that labels "Reels" as a Date is worse than no table at all.
   */
  xLabel?: string;
  /** How to render a point's `date` in the data table. Defaults to a full date. */
  formatX?: (value: string) => string;
}

export function ChartFrame({
  title,
  subtitle,
  series,
  children,
  emptyHint,
  loading = false,
  actions,
  className = "",
  describedById,
  xLabel = "Date",
  formatX = fmtDateLong,
}: ChartFrameProps) {
  const hasData = series.some((s) => s.points.length > 0);
  const showLegend = series.filter((s) => s.style !== "dashed").length > 1;

  return (
    <figure
      className={`rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
          {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-1">{actions}</div>}
      </div>

      {showLegend && (
        <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="h-40 animate-pulse rounded-xl bg-surface"
        >
          <span className="sr-only">Loading {title}</span>
        </div>
      ) : hasData ? (
        <>
          {describedById && (
            <p id={describedById} className="sr-only">
              Interactive chart. Press Tab to focus it, then use the left and right arrow keys to
              move between data points, Home and End to jump to either end, and Escape to dismiss
              the reading.
            </p>
          )}
          {children}
          <DataTable title={title} series={series} xLabel={xLabel} formatX={formatX} />
        </>
      ) : (
        <p className="py-10 text-center text-sm text-ink-soft">
          {emptyHint ?? "Not enough history yet — check back after a few syncs."}
        </p>
      )}
    </figure>
  );
}

/**
 * Every plotted value as a real table, visually hidden.
 *
 * Not a fallback — it is the accessible representation, and it is exact where a
 * spoken summary of a line chart never can be.
 */
function DataTable({
  title,
  series,
  xLabel,
  formatX,
}: {
  title: string;
  series: ChartSeriesMeta[];
  xLabel: string;
  formatX: (value: string) => string;
}) {
  // Union of dates across series, so a sparse series still lines up.
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))];
  // Dates sort chronologically; category labels must keep the order the caller
  // chose (funnel stages are not alphabetical).
  if (xLabel === "Date") dates.sort();
  if (dates.length === 0) return null;

  const lookup = series.map((s) => ({
    meta: s,
    byDate: new Map(s.points.map((p) => [p.date, p.value])),
  }));

  return (
    <table className="sr-only">
      <caption>{title} — data table</caption>
      <thead>
        <tr>
          <th scope="col">{xLabel}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dates.map((date) => (
          <tr key={date}>
            <th scope="row">{formatX(date)}</th>
            {lookup.map(({ meta, byDate }) => (
              <td key={meta.key}>
                {byDate.has(date) ? fmtByUnit(byDate.get(date)!, meta.unit) : "no data"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
