"use client";

// The conversion funnel: impressions → reach → engaged → follows.
//
// The step-to-step rate is the point, not the absolute widths — "you reach 40%
// of the people you appear to" is actionable, "you had 12,000 impressions" is
// not. So each stage states its drop from the one above, and a stage the
// platform cannot report is rendered as a gap rather than silently closed up,
// because a funnel with a missing rung is not the same as a shorter funnel.

import { ChartFrame, type ChartFrameProps } from "./ChartFrame";
import { fmtByUnit, fmtPct } from "./format";

export interface FunnelStage {
  key: string;
  label: string;
  value: number | null;
  color: string;
  /** Why it is missing, when it is. Straight from the capability matrix. */
  unavailableReason?: string;
}

export interface FunnelChartProps
  extends Omit<ChartFrameProps, "children" | "series" | "xLabel" | "formatX"> {
  stages: FunnelStage[];
}

export function FunnelChart({ stages, ...frame }: FunnelChartProps) {
  const top = stages.find((s) => s.value !== null)?.value ?? 0;
  const max = top || 1;

  return (
    <ChartFrame
      {...frame}
      xLabel="Stage"
      formatX={(v) => v}
      series={stages.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        unit: "count" as const,
        points: s.value === null ? [] : [{ date: s.label, value: s.value }],
      }))}
    >
      <ol className="space-y-2">
        {stages.map((stage, i) => {
          // The previous stage that actually has a number — comparing against a
          // missing one would invent a conversion rate.
          const previous = stages.slice(0, i).reverse().find((s) => s.value !== null);
          const rate =
            stage.value !== null && previous && previous.value !== null && previous.value > 0
              ? (stage.value / previous.value) * 100
              : null;

          return (
            <li key={stage.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-ink">{stage.label}</span>
                <span className="flex-shrink-0 tabular-nums">
                  {stage.value === null ? (
                    <span className="text-ink-soft" title={stage.unavailableReason}>
                      not reported
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-ink">{fmtByUnit(stage.value, "count")}</span>
                      {rate !== null && <span className="ml-2 text-ink-soft">{fmtPct(rate)} of previous</span>}
                    </>
                  )}
                </span>
              </div>
              {stage.value === null ? (
                <div
                  aria-hidden="true"
                  className="h-6 w-full rounded-lg border border-dashed border-card-border"
                />
              ) : (
                <div aria-hidden="true" className="h-6 w-full overflow-hidden rounded-lg bg-surface">
                  <div
                    className="h-full rounded-lg"
                    style={{ width: `${(stage.value / max) * 100}%`, background: stage.color }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
