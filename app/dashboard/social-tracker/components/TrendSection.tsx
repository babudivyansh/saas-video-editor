"use client";

import { TimeSeriesChart } from "@/app/components/charts";

/**
 * The two trends that answer "am I growing, and is my content travelling?".
 *
 * Follower count is a level and views is a flow, so they get separate charts
 * rather than a shared axis — plotting a cumulative count against per-day gains
 * makes one of them a flat line at the bottom.
 */
export function TrendSection({
  followers,
  views,
  rangeDays,
  granularity,
}: {
  followers: Array<{ date: string; value: number }>;
  views: Array<{ date: string; value: number }>;
  rangeDays: number;
  granularity: "day" | "week" | "month";
}) {
  const period = `Last ${rangeDays} days · ${granularity === "day" ? "daily" : granularity === "week" ? "weekly" : "monthly"}`;

  return (
    <section aria-labelledby="trends-heading" className="space-y-4">
      <h2 id="trends-heading" className="text-sm font-semibold text-ink">
        Trends
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TimeSeriesChart
          title="Follower growth"
          subtitle={period}
          variant="area"
          series={[
            { key: "followers", label: "Followers", color: "var(--brand)", unit: "count", points: followers },
          ]}
          emptyHint="Not enough history yet — follower trends appear after a few syncs."
        />

        <TimeSeriesChart
          title="Views"
          subtitle={period}
          variant="area"
          series={[
            { key: "views", label: "Views", color: "var(--accent-violet)", unit: "count", points: views },
          ]}
          emptyHint="No view data for this range yet."
        />
      </div>
    </section>
  );
}
