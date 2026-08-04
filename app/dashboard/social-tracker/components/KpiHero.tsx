"use client";

// The four numbers you actually came for.
//
// The grid used to render nineteen tiles at identical weight, so "Total
// followers" looked exactly like "Click-through rate — not available" and the
// eye had nowhere to land. These four get display-size type, a trend line and a
// coloured delta; everything else is demoted beneath them.

import { fmtByUnit, type ValueUnit } from "@/app/components/charts/format";
import { Sparkline } from "@/app/components/charts";

export interface HeroMetric {
  key: string;
  label: string;
  value: number | null;
  deltaPct: number | null;
  unit: ValueUnit;
  sparkline?: Array<{ date: string; value: number }>;
  /** For metrics where rising is bad (followers lost). */
  invertDelta?: boolean;
  /** The platform's typical band, where one exists. Engagement rate only. */
  benchmark?: { low: number; high: number } | null;
}

export function KpiHero({ metrics }: { metrics: HeroMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <section aria-labelledby="kpi-hero-heading">
      <h2 id="kpi-hero-heading" className="sr-only">
        Headline metrics
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <article
            key={m.key}
            className="rounded-[var(--radius-card)] border border-card-border bg-white p-5 shadow-card"
          >
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{m.label}</p>

            <p className="mt-1 text-3xl font-extrabold leading-tight text-ink">
              {m.value === null ? <span className="text-ink-soft">—</span> : fmtByUnit(m.value, m.unit)}
            </p>

            <div className="mt-1 flex h-6 items-center">
              <Delta pct={m.deltaPct} invert={m.invertDelta} />
            </div>

            {m.benchmark && (
              // A rate means little without the band it should sit in. Kept in
              // the hero rather than lost on promotion.
              <p className="mt-1 text-xs text-ink-soft">
                typical · {m.benchmark.low}–{m.benchmark.high}%
              </p>
            )}

            {m.sparkline && m.sparkline.length > 1 && (
              <div className="mt-2">
                <Sparkline points={m.sparkline} filled height={34} />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * The delta, in colour AND in words.
 *
 * The arrow stays because colour is never the only signal, and "no comparison"
 * is stated rather than left blank — a missing delta and a flat one look
 * identical otherwise.
 */
function Delta({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct === null) {
    return <span className="text-xs text-ink-soft">No comparison yet</span>;
  }
  const flat = Math.abs(pct) < 0.05;
  const good = invert ? pct < 0 : pct > 0;

  if (flat) {
    return <span className="text-xs font-semibold text-ink-soft">→ Flat vs previous</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      <span aria-hidden="true">{pct > 0 ? "↑" : "↓"}</span>
      {Math.abs(pct).toFixed(1)}%
      <span className="sr-only">{good ? "better than" : "worse than"} the previous period</span>
    </span>
  );
}
