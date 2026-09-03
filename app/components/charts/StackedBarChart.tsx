"use client";

// Stacked bars over time — interactions split by kind, views split by content
// type, followers gained vs lost.
//
// Shares the cursor contract with TimeSeriesChart, so keyboard and touch behave
// identically across the kit. A user who learns one chart has learned them all.

import { useId, useMemo, useRef } from "react";
import { ChartFrame, type ChartFrameProps } from "./ChartFrame";
import { useChartCursor } from "./useChartCursor";
import { fmtByUnit, fmtDateLong, fmtDateShort } from "./format";

const VIEW_W = 600;
const PAD = { top: 12, right: 14, bottom: 24, left: 46 };

export interface StackedBarChartProps extends Omit<ChartFrameProps, "children" | "describedById"> {
  height?: number;
  onPointSelect?: (date: string) => void;
}

export function StackedBarChart({ height = 200, onPointSelect, ...frame }: StackedBarChartProps) {
  const describedById = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const plot = useMemo(() => {
    const dates = [...new Set(frame.series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const byKey = new Map(frame.series.map((s) => [s.key, new Map(s.points.map((p) => [p.date, p.value]))]));
    // The axis is scaled to the TOTAL of each stack, not to the tallest single
    // series — scaling to the series maximum would push stacks off the top.
    const totals = dates.map((d) =>
      frame.series.reduce((sum, s) => sum + Math.max(0, byKey.get(s.key)?.get(d) ?? 0), 0),
    );
    return { dates, byKey, max: Math.max(...totals, 0) || 1 };
  }, [frame.series]);

  const cursor = useChartCursor(svgRef, plot.dates.length, {
    plotLeft: PAD.left,
    plotWidth: VIEW_W - PAD.left - PAD.right,
    onSelect: (i) => onPointSelect?.(plot.dates[i]),
  });

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, plot.dates.length);
  const barW = Math.max(2, slot * 0.66);
  const focusedDate = cursor.index !== null ? plot.dates[cursor.index] : null;

  return (
    <ChartFrame {...frame} describedById={describedById}>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="w-full touch-pan-y rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-describedby={describedById}
          aria-label={`${frame.title}. ${plot.dates.length} stacked bars.`}
          {...cursor.handlers}
        >
          {plot.dates.map((date, i) => {
            let cursorY = PAD.top + plotH;
            return (
              <g key={date}>
                {frame.series.map((s) => {
                  const value = Math.max(0, plot.byKey.get(s.key)?.get(date) ?? 0);
                  const h = (value / plot.max) * plotH;
                  cursorY -= h;
                  return h <= 0 ? null : (
                    <rect
                      key={s.key}
                      x={PAD.left + i * slot + (slot - barW) / 2}
                      y={cursorY}
                      width={barW}
                      height={h}
                      fill={s.color}
                      opacity={focusedDate === null || focusedDate === date ? 1 : 0.45}
                    />
                  );
                })}
              </g>
            );
          })}

          {plot.dates.length > 0 && (
            <>
              <text x={PAD.left} y={height - 6} className="fill-ink-soft text-[10px]">
                {fmtDateShort(plot.dates[0])}
              </text>
              <text x={VIEW_W - PAD.right} textAnchor="end" y={height - 6} className="fill-ink-soft text-[10px]">
                {fmtDateShort(plot.dates[plot.dates.length - 1])}
              </text>
            </>
          )}
        </svg>

        {/* The focused reading, announced politely — the same contract every
            chart in this kit honours. */}
        <p aria-live="polite" className="sr-only">
          {focusedDate
            ? `${fmtDateLong(focusedDate)}: ${frame.series
                .map((s) => `${s.label} ${fmtByUnit(plot.byKey.get(s.key)?.get(focusedDate) ?? null, s.unit)}`)
                .join(", ")}`
            : ""}
        </p>

        {focusedDate && (
          <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-card-border bg-panel px-2.5 py-1.5 text-xs shadow-card">
            <p className="font-semibold text-ink">{fmtDateLong(focusedDate)}</p>
            {frame.series.map((s) => (
              <p key={s.key} className="text-ink-soft">
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: s.color }}
                />
                {s.label}: {fmtByUnit(plot.byKey.get(s.key)?.get(focusedDate) ?? null, s.unit)}
              </p>
            ))}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
