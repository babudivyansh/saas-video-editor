"use client";

// One trend chart with a metric switch, instead of two charts side by side.
// Follower count is a level and views is a flow, so they never share an axis:
// the switch swaps the series rather than overlaying them.

import { useState } from "react";
import { TimeSeriesChart } from "@/app/components/charts";
import { PALETTE } from "@/app/components/dashboard";

type Point = { date: string; value: number };

const METRICS = [
  { key: "views", label: "Views", color: PALETTE[1], empty: "No view data for this period yet." },
  { key: "followers", label: "Followers", color: "var(--brand)", empty: "Follower trends appear after a few syncs." },
] as const;

export function TrendChart({
  views,
  followers,
  rangeDays,
  granularity,
}: {
  views: Point[];
  followers: Point[];
  rangeDays: number;
  granularity: "day" | "week" | "month";
}) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("views");
  const m = METRICS.find((x) => x.key === metric)!;
  const points = metric === "views" ? views : followers;
  const period = `Last ${rangeDays === 365 ? "12 months" : `${rangeDays} days`} · ${granularity === "day" ? "daily" : granularity === "week" ? "weekly" : "monthly"}`;

  return (
    <TimeSeriesChart
      title={m.label}
      subtitle={period}
      variant="area"
      // A trend needs two points; with one the chart invents an axis around a
      // lone value. An empty series shows the hint instead.
      series={[{ key: m.key, label: m.label, color: m.color, unit: "count", points: points.length > 1 ? points : [] }]}
      emptyHint={m.empty}
      actions={
        <div role="group" aria-label="Metric" className="flex gap-1">
          {METRICS.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={metric === x.key}
              onClick={() => setMetric(x.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                metric === x.key ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      }
    />
  );
}
