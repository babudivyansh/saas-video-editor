"use client";

// The executive KPI block: a hero row, a compact grid, and one honest line
// about what this platform cannot report.
//
// It used to render all nineteen KPIs as identical tiles, including the eight
// that said "Not available" — so the page led with absence and nothing had more
// weight than anything else. The information is unchanged; the ranking is new.
//
// Unavailable metrics are still NAMED, because "YouTube doesn't publish
// impressions" is worth knowing and silently dropping it would leave the user
// wondering. They are named in a sentence rather than in eight empty cards.

import type { MetricKey, Support } from "@/lib/social/capabilities";
import type { ValueUnit } from "@/app/components/charts/format";
import { KpiCard } from "./KpiCard";
import { KpiHero } from "./KpiHero";

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

/**
 * Candidates for the hero row, best first.
 *
 * The first four that this platform actually reports get promoted. It is a
 * preference list rather than a fixed set because a YouTube channel and an
 * Instagram account do not report the same things, and a hero row with two
 * empty cards would be worse than the flat grid it replaces.
 */
const HERO_PRIORITY: MetricKey[] = [
  "followers",
  "views",
  "reach",
  "engagementRate",
  "impressions",
  "totalInteractions",
  "likes",
];

const HERO_COUNT = 4;

export function KpiGrid({ kpis, derived, sparklines, benchmark }: KpiGridProps) {
  const labelOf = (metric: MetricKey) =>
    CATALOGUE.find((c) => c.metric === metric)?.label ?? metric;

  const reports = (metric: MetricKey) => {
    const kpi = kpis[metric];
    return Boolean(kpi && kpi.available !== "unavailable");
  };

  // Prefer metrics that have a number; fall back to available-but-empty so the
  // row is always full rather than collapsing on a freshly connected account.
  const heroKeys = [
    ...HERO_PRIORITY.filter((m) => reports(m) && kpis[m]?.current !== null),
    ...HERO_PRIORITY.filter((m) => reports(m) && kpis[m]?.current === null),
  ].slice(0, HERO_COUNT);

  const heroSet = new Set<MetricKey>(heroKeys);

  // Everything this platform cannot report, named once instead of occupying
  // eight cards that all say "Not available".
  const unavailable = CATALOGUE.filter(({ metric }) => kpis[metric]?.available === "unavailable");
  const unavailableReason = unavailable
    .map(({ metric }) => kpis[metric]?.reason)
    .find((r): r is string => Boolean(r));

  return (
    <div className="space-y-6">
      <KpiHero
        metrics={heroKeys.map((metric) => ({
          key: metric,
          label: labelOf(metric),
          value: kpis[metric]!.current,
          deltaPct: kpis[metric]!.deltaPct,
          unit: kpis[metric]!.unit,
          sparkline: sparklines?.[metric],
          invertDelta: CATALOGUE.find((c) => c.metric === metric)?.invert,
          benchmark: metric === "engagementRate" ? benchmark : undefined,
        }))}
      />

      <section aria-labelledby="kpi-grid-heading">
        <h2 id="kpi-grid-heading" className="sr-only">
          Key performance indicators
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {CATALOGUE.map(({ metric, label, invert }) => {
          const kpi = kpis[metric];
          // Promoted into the hero, or not reported at all — either way it does
          // not belong in this grid.
          if (!kpi || heroSet.has(metric) || kpi.available === "unavailable") return null;
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

        {unavailable.length > 0 && (
          // One line, not eight dead cards. The information is the same and it
          // stops absence from being the loudest thing on the page.
          <p className="mt-3 text-xs text-ink-soft" title={unavailableReason}>
            <span className="font-semibold">Not reported by this platform:</span>{" "}
            {unavailable.map(({ label }) => label.replace(/^Total /, "").toLowerCase()).join(", ")}.
          </p>
        )}
      </section>
    </div>
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
