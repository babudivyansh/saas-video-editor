"use client";

import { TimeSeriesChart } from "@/app/components/charts";
import { PALETTE, SPAN } from "@/app/components/dashboard";

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

  // A trend needs two points to be a trend. With one, the area chart drew no
  // visible line, invented a y-axis around the lone value (89.3–98.7 for a
  // single 94) and labelled both ends of the x-axis "5 Aug". Handing the chart
  // an empty series instead surfaces the emptyHint it already carries.
  //
  // Done here rather than in ChartFrame: n=1 is only meaningless for a LINE.
  // A bar or a single-row data table reads fine, and other charts rely on that.
  const trend = (points: Array<{ date: string; value: number }>) =>
    points.length > 1 ? points : [];

  // Returns the two cards as direct children of the enclosing Band's 12-column
  // grid, rather than a section with its own heading and its own nested grid —
  // the Band supplies both, and two grids would fight over the gap.
  return (
    <>
      <div className={SPAN[6]}>
        <TimeSeriesChart
          title="Follower growth"
          subtitle={period}
          variant="area"
          series={[
            { key: "followers", label: "Followers", color: "var(--brand)", unit: "count", points: trend(followers) },
          ]}
          emptyHint="Not enough history yet — follower trends appear after a few syncs."
        />
      </div>

      <div className={SPAN[6]}>
        <TimeSeriesChart
          title="Views"
          subtitle={period}
          variant="area"
          series={[
            // PALETTE[1], not --accent-violet: the emerald theme re-points that
            // variable at --emerald-bright, so the two trend charts on this row
            // were rendering the same hue. This is a validated categorical step
            // that stays separable from the brand green.
            { key: "views", label: "Views", color: PALETTE[1], unit: "count", points: trend(views) },
          ]}
          emptyHint="No view data for this range yet."
        />
      </div>
    </>
  );
}
