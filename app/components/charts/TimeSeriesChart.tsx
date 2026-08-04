"use client";

// Multi-series line / area chart with a pointer + keyboard cursor.
//
// Props are deliberately library-agnostic: if the hand-rolled internals ever
// need to become recharts, that swap should not touch a single caller.

import { useId, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ChartFrame, type ChartFrameProps, type ChartSeriesMeta } from "./ChartFrame";
import { useChartCursor } from "./useChartCursor";
import { fmtByUnit, fmtDateLong, fmtDateShort } from "./format";

const VIEW_W = 600;
const PAD = { top: 12, right: 14, bottom: 24, left: 46 };

export interface TimeSeriesChartProps
  extends Omit<ChartFrameProps, "children" | "describedById"> {
  variant?: "line" | "area";
  height?: number;
  /** Vertical markers — publishes, milestones, alerts. */
  annotations?: Array<{ date: string; label: string; kind?: "post" | "milestone" | "alert" }>;
  onPointSelect?: (date: string) => void;
}

export function TimeSeriesChart({
  variant = "line",
  height = 200,
  annotations = [],
  onPointSelect,
  ...frame
}: TimeSeriesChartProps) {
  const describedById = useId();
  const gradientId = useId();
  const reduceMotion = useReducedMotion();

  const plot = useMemo(() => buildPlot(frame.series, height), [frame.series, height]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const cursor = useChartCursor(svgRef, plot.dates.length, {
    plotLeft: PAD.left,
    plotWidth: VIEW_W - PAD.left - PAD.right,
    onSelect: (i) => onPointSelect?.(plot.dates[i]),
  });

  const focused = cursor.index !== null ? plot.dates[cursor.index] : null;

  return (
    <ChartFrame {...frame} describedById={describedById}>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="w-full touch-pan-y focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
          aria-describedby={describedById}
          aria-label={`${frame.title}. ${plot.dates.length} data points from ${
            plot.dates[0] ?? ""
          } to ${plot.dates[plot.dates.length - 1] ?? ""}.`}
          {...cursor.handlers}
        >
          {plot.gridY.map((y) => (
            <line
              key={y}
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={y}
              y2={y}
              stroke="var(--card-border)"
              strokeWidth="1"
            />
          ))}

          {/* Axis labels in a text token, never a series colour. */}
          <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
            {fmtByUnit(plot.max, plot.unit)}
          </text>
          <text
            x={PAD.left - 6}
            y={height - PAD.bottom + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--ink-soft)"
          >
            {fmtByUnit(plot.min, plot.unit)}
          </text>
          {plot.dates.length > 0 && (
            <>
              <text x={PAD.left} y={height - 6} fontSize="10" fill="var(--ink-soft)">
                {fmtDateShort(plot.dates[0])}
              </text>
              <text
                x={VIEW_W - PAD.right}
                y={height - 6}
                textAnchor="end"
                fontSize="10"
                fill="var(--ink-soft)"
              >
                {fmtDateShort(plot.dates[plot.dates.length - 1])}
              </text>
            </>
          )}

          {annotations.map((a) => {
            const i = plot.dates.indexOf(a.date);
            if (i < 0) return null;
            const x = plot.x(i);
            return (
              <line
                key={`${a.date}-${a.label}`}
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={height - PAD.bottom}
                stroke="var(--accent-violet)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity={0.5}
              />
            );
          })}

          {plot.lines.map((line) => (
            <g key={line.key}>
              {variant === "area" && line.area && (
                <>
                  <defs>
                    <linearGradient id={`${gradientId}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={line.color} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={line.area} fill={`url(#${gradientId}-${line.key})`} />
                </>
              )}
              <path
                d={line.path}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={line.dashed ? "4 4" : undefined}
                // Reduced motion skips the draw-in entirely rather than
                // shortening it — the existing globals.css block does the same.
                className={reduceMotion ? undefined : "chart-animate"}
              />
            </g>
          ))}

          {cursor.index !== null && (
            <>
              <line
                x1={plot.x(cursor.index)}
                x2={plot.x(cursor.index)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                stroke="var(--ink-soft)"
                strokeWidth="1"
                opacity={0.4}
              />
              {plot.lines.map((line) => {
                const v = line.values[cursor.index!];
                if (v == null) return null;
                return (
                  <circle
                    key={line.key}
                    cx={plot.x(cursor.index!)}
                    cy={plot.y(v)}
                    r="4"
                    fill={line.color}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                );
              })}
            </>
          )}
        </svg>

        {focused && cursor.index !== null && (
          <Tooltip
            xRatio={(plot.x(cursor.index) - PAD.left) / (VIEW_W - PAD.left - PAD.right)}
            date={focused}
            rows={plot.lines
              .map((l) => ({ label: l.label, color: l.color, value: l.values[cursor.index!], unit: l.unit }))
              .filter((r) => r.value != null)}
          />
        )}

        {/* Announces the focused point to screen readers as the cursor moves. */}
        <p className="sr-only" role="status" aria-live="polite">
          {focused && cursor.index !== null
            ? `${fmtDateLong(focused)}: ${plot.lines
                .map((l) =>
                  l.values[cursor.index!] == null
                    ? null
                    : `${l.label} ${fmtByUnit(l.values[cursor.index!], l.unit)}`,
                )
                .filter(Boolean)
                .join(", ")}`
            : ""}
        </p>
      </div>
    </ChartFrame>
  );
}

function Tooltip({
  xRatio,
  date,
  rows,
}: {
  xRatio: number;
  date: string;
  rows: Array<{ label: string; color: string; value: number | null; unit: ChartSeriesMeta["unit"] }>;
}) {
  // Flip the anchor past the midpoint so the tooltip never runs off the card.
  const flip = xRatio > 0.6;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-lg border border-card-border bg-white px-2.5 py-1.5 shadow-card"
      style={{ left: `${xRatio * 100}%`, transform: flip ? "translateX(-100%)" : "none" }}
      aria-hidden="true"
    >
      <p className="mb-0.5 text-xs font-semibold text-ink">{fmtDateLong(date)}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
          {r.label}
          <span className="font-semibold text-ink">{fmtByUnit(r.value, r.unit)}</span>
        </p>
      ))}
    </div>
  );
}

/** Scales, paths and the shared date axis. Pure — no React, easy to reason about. */
function buildPlot(series: ChartSeriesMeta[], height: number) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter(Number.isFinite);
  let min = all.length > 0 ? Math.min(...all) : 0;
  let max = all.length > 0 ? Math.max(...all) : 1;
  // A flat series would otherwise divide by zero and collapse to the baseline.
  if (min === max) {
    min = min === 0 ? 0 : min * 0.95;
    max = max === 0 ? 1 : max * 1.05;
  }
  // Follower counts rarely start at zero; anchoring the axis there flattens
  // every real movement into a straight line.
  const span = max - min || 1;

  const x = (i: number) => (dates.length <= 1 ? PAD.left + plotW / 2 : PAD.left + (i / (dates.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH;

  const lines = series.map((s) => {
    const byDate = new Map(s.points.map((p) => [p.date, p.value]));
    const values = dates.map((d) => byDate.get(d) ?? null);

    let path = "";
    let started = false;
    values.forEach((v, i) => {
      if (v == null) {
        // Break the line across a gap rather than drawing through it — a
        // straight segment across missing days implies activity that did not
        // happen.
        started = false;
        return;
      }
      path += `${started ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      started = true;
    });

    const first = values.findIndex((v) => v != null);
    const last = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
    const area =
      first >= 0 && path
        ? `${path}L${x(last).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L${x(first).toFixed(1)} ${(
            PAD.top + plotH
          ).toFixed(1)} Z`
        : "";

    return {
      key: s.key,
      label: s.label,
      color: s.color,
      unit: s.unit,
      dashed: s.style === "dashed",
      values,
      path: path.trim(),
      area,
    };
  });

  const gridY = [0, 0.5, 1].map((t) => PAD.top + t * plotH);

  return { dates, lines, x, y, min, max, gridY, unit: series[0]?.unit ?? "count" };
}
