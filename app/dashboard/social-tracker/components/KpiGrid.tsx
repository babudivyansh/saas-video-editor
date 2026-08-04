"use client";

// The executive KPI grid.
//
// Every requested KPI renders, always, on every platform. Which ones are LIVE
// depends on the capability matrix — the grid's shape stays stable so switching
// between a YouTube and an Instagram account does not reflow the page, and a
// greyed tile teaches the user something ("YouTube doesn't publish impressions")
// rather than hiding the gap.

import type { MetricKey, Support } from "@/lib/social/capabilities";
import type { ValueUnit } from "@/app/components/charts/format";
import { KpiCard } from "./KpiCard";

export interface KpiEntry {
  current: number | null;
  previous: number | null;
  deltaPct: number | null;
  available: Support;
  unit: ValueUnit;
  reason?: string;
  accountsReporting?: number;
}

export interface KpiGridProps {
  kpis: Partial<Record<MetricKey, KpiEntry>>;
  /** Growth figures that are not provider metrics in their own right. */
  derived?: {
    averageViews?: { current: number | null; previous: number | null; deltaPct: number | null };
    dailyGrowth?: number | null;
    weeklyGrowth?: number | null;
    monthlyGrowth?: number | null;
  };
  sparklines?: Partial<Record<MetricKey, Array<{ date: string; value: number }>>>;
  benchmark?: { low: number; high: number } | null;
}

/**
 * Display order and labels.
 *
 * Ordered by what a creator checks first, not by the API's shape: audience size,
 * then how far content travelled, then how people responded, then video depth.
 */
const CATALOGUE: Array<{ metric: MetricKey; label: string; invert?: boolean }> = [
  { metric: "followers", label: "Total followers" },
  { metric: "reach", label: "Total reach" },
  { metric: "impressions", label: "Total impressions" },
  { metric: "profileViews", label: "Profile visits" },
  { metric: "views", label: "Total views" },
  { metric: "engagementRate", label: "Engagement rate" },
  { metric: "likes", label: "Likes" },
  { metric: "comments", label: "Comments" },
  { metric: "shares", label: "Shares" },
  { metric: "saves", label: "Saves" },
  { metric: "watchTimeSec", label: "Watch time" },
  { metric: "ctr", label: "Click-through rate" },
  { metric: "followerGrowthRate", label: "Growth rate" },
  { metric: "postsPublished", label: "Posts published" },
  { metric: "postingFrequency", label: "Posts / week" },
  // Losing followers is bad, so a rising number must not render green.
  { metric: "followersLost", label: "Followers lost", invert: true },
];

export function KpiGrid({ kpis, derived, sparklines, benchmark }: KpiGridProps) {
  return (
    <section aria-labelledby="kpi-grid-heading">
      <h2 id="kpi-grid-heading" className="sr-only">
        Key performance indicators
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {CATALOGUE.map(({ metric, label, invert }) => {
          const kpi = kpis[metric];
          if (!kpi) return null;
          return (
            <KpiCard
              key={metric}
              metric={metric}
              label={label}
              available={kpi.available}
              unit={kpi.unit}
              value={kpi.current}
              previous={kpi.previous}
              deltaPct={kpi.deltaPct}
              reason={kpi.reason}
              sparkline={sparklines?.[metric]}
              benchmark={metric === "engagementRate" ? benchmark : undefined}
              accountsReporting={kpi.accountsReporting}
              invertDelta={invert}
            />
          );
        })}

        {/* Derived tiles. Not MetricKeys — computed for presentation, and marked
            available since they are always computable from the follower series. */}
        {derived?.averageViews && (
          <KpiCard
            metric="views"
            label="Average views / post"
            available={kpis.views?.available ?? "derived"}
            unit="count"
            value={derived.averageViews.current}
            previous={derived.averageViews.previous}
            deltaPct={derived.averageViews.deltaPct}
          />
        )}
        {derived && (
          <>
            <GrowthTile label="Daily growth" pct={derived.dailyGrowth} />
            <GrowthTile label="Weekly growth" pct={derived.weeklyGrowth} />
            <GrowthTile label="Monthly growth" pct={derived.monthlyGrowth} />
          </>
        )}
      </div>
    </section>
  );
}

/** A growth rate has no previous-period comparison — it IS the comparison. */
function GrowthTile({ label, pct }: { label: string; pct: number | null | undefined }) {
  return (
    <KpiCard
      metric="followerGrowthRate"
      label={label}
      available="derived"
      unit="percent"
      value={pct ?? null}
    />
  );
}
