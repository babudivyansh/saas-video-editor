"use client";

// Composition as a donut — content mix, audience split, traffic sources.
//
// Only ever used for parts of a whole, and only for a handful of slices. Past
// about six the arcs stop being comparable and ComparisonBars is the honest
// choice; the caller decides, but that is what the `other` bucket is for.

import { ChartFrame, type ChartFrameProps } from "./ChartFrame";
import { fmtByUnit, fmtPct } from "./format";

const SIZE = 160;
const RADIUS = 66;
const THICKNESS = 26;

export interface DonutChartProps extends Omit<ChartFrameProps, "children" | "xLabel" | "formatX"> {
  /** Rendered in the hole. Usually the total. */
  centerLabel?: string;
  centerValue?: string;
  categoryLabel?: string;
}

export function DonutChart({
  centerLabel,
  centerValue,
  categoryLabel = "Segment",
  ...frame
}: DonutChartProps) {
  const slices = frame.series
    .map((s) => ({ meta: s, value: s.points[0]?.value ?? 0, label: s.points[0]?.date ?? s.label }))
    .filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const circumference = 2 * Math.PI * RADIUS;

  // Arcs are drawn with stroke-dasharray on one circle per slice rather than
  // with path arcs: no trigonometry, no large-arc-flag bugs at >180°, and it
  // degrades to a clean ring when a single slice is 100%.
  //
  // Offsets are accumulated up front rather than mutated inside the JSX map:
  // this repo's react-hooks/immutability rule is an ERROR, and it is right —
  // a running total in render is exactly what breaks under concurrent
  // re-rendering.
  const arcs = slices.reduce<Array<{ dash: number; offset: number }>>((acc, slice) => {
    const dash = total > 0 ? (slice.value / total) * circumference : 0;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    return [...acc, { dash, offset }];
  }, []);

  return (
    <ChartFrame {...frame} xLabel={categoryLabel} formatX={(v) => v}>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-40 w-40 flex-shrink-0 -rotate-90"
          role="presentation"
        >
          {slices.map(({ meta }, i) => (
            <circle
              key={meta.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={meta.color}
              strokeWidth={THICKNESS}
              strokeDasharray={`${arcs[i].dash} ${circumference - arcs[i].dash}`}
              strokeDashoffset={-arcs[i].offset}
            />
          ))}
        </svg>

        <div className="min-w-[9rem]">
          {(centerValue || centerLabel) && (
            <p className="mb-2">
              <span className="block text-lg font-extrabold text-ink">{centerValue}</span>
              <span className="block text-xs text-ink-soft">{centerLabel}</span>
            </p>
          )}
          <ul className="space-y-1">
            {slices.map(({ meta, value, label }) => (
              <li key={meta.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: meta.color }}
                />
                <span className="truncate text-ink-soft">{label}</span>
                <span className="ml-auto flex-shrink-0 font-semibold tabular-nums text-ink">
                  {fmtByUnit(value, meta.unit)}
                  <span className="ml-1 font-normal text-ink-soft">
                    {total > 0 ? fmtPct((value / total) * 100) : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartFrame>
  );
}
