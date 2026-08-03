"use client";

// One KPI tile.
//
// THREE STATES, and keeping them distinct is the whole point. The old dashboard
// rendered a metric the platform cannot report, a metric that has not synced
// yet, and a metric that is genuinely zero identically — as "0" or "—" with no
// explanation. That is actively misleading: a creator seeing "Impressions 0"
// concludes their reach collapsed, when YouTube simply never exposed the number.
//
//   available    — real value, delta, sparkline, optional benchmark
//   no data yet  — em dash plus "Collecting", visually distinct from a real zero
//   unavailable  — greyed, dashed border, and a tooltip naming the limitation

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { MetricKey, Support } from "@/lib/social/capabilities";
import { fmtByUnit, type ValueUnit } from "@/app/components/charts/format";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { Sparkline } from "./Sparkline";

export interface KpiCardProps {
  metric: MetricKey;
  label: string;
  available: Support;
  unit: ValueUnit;
  value: number | null;
  previous?: number | null;
  deltaPct?: number | null;
  /** Explains the greyed state. Required when available === "unavailable". */
  reason?: string;
  sparkline?: Array<{ date: string; value: number }>;
  benchmark?: { low: number; high: number } | null;
  /** For an aggregate tile: how many accounts contributed. */
  accountsReporting?: number;
  /** Higher is better for most metrics; followersLost inverts it. */
  invertDelta?: boolean;
}

export function KpiCard({
  metric,
  label,
  available,
  unit,
  value,
  previous,
  deltaPct,
  reason,
  sparkline,
  benchmark,
  accountsReporting,
  invertDelta = false,
}: KpiCardProps) {
  if (available === "unavailable") {
    return <UnavailableCard label={label} reason={reason} />;
  }
  if (value === null) {
    return <CollectingCard label={label} />;
  }
  return (
    <div
      className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
      data-metric={metric}
    >
      <p className="text-xs font-medium tracking-wide text-ink-soft">{label}</p>

      <div className="mt-1 flex items-baseline gap-2">
        <AnimatedValue value={value} unit={unit} />
        {deltaPct != null && <DeltaChip pct={deltaPct} invert={invertDelta} />}
      </div>

      {previous != null && (
        <p className="mt-0.5 text-xs text-ink-soft">
          was {fmtByUnit(previous, unit)}
        </p>
      )}

      {benchmark && <BenchmarkBar value={value} low={benchmark.low} high={benchmark.high} />}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-2">
          <Sparkline points={sparkline} />
        </div>
      )}

      {accountsReporting != null && accountsReporting > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          {accountsReporting} {accountsReporting === 1 ? "account" : "accounts"} reporting
        </p>
      )}
    </div>
  );
}

function UnavailableCard({ label, reason }: { label: string; reason?: string }) {
  const explanation = reason ?? "This platform does not report this metric.";
  return (
    <Tooltip content={explanation}>
      {/* Still focusable: a keyboard user must be able to reach the explanation.
          aria-disabled rather than disabled, because this is not a control. */}
      <span
        tabIndex={0}
        aria-disabled="true"
        className="block h-full rounded-[var(--radius-card)] border border-dashed border-card-border bg-surface p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {/* Spans throughout: Tooltip wraps its children in a span, so a div
            here would be invalid HTML and React would warn in dev. */}
        <span className="block text-xs font-medium tracking-wide text-ink-soft">{label}</span>
        <span className="mt-1 block text-2xl font-extrabold text-ink-soft/50" aria-hidden="true">
          —
        </span>
        <span className="sr-only">Not available. {explanation}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">Not available</span>
      </span>
    </Tooltip>
  );
}

function CollectingCard({ label }: { label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink-soft/60" aria-hidden="true">
        —
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">Collecting — check back after a few syncs.</p>
    </div>
  );
}

/**
 * Count-up on first paint.
 *
 * Under reduced motion the final value is returned IMMEDIATELY — not a shortened
 * animation. A fast animation is still motion, and the request was for none.
 */
function AnimatedValue({ value, unit }: { value: number; unit: ValueUnit }) {
  const reduceMotion = useReducedMotion();
  // Two components rather than a branch inside one: the reduced-motion path then
  // holds no state and runs no effect at all, so there is no setState in an
  // effect body to schedule a second render for.
  return reduceMotion ? (
    <ValueText>{fmtByUnit(value, unit)}</ValueText>
  ) : (
    <CountUpValue value={value} unit={unit} />
  );
}

function ValueText({ children }: { children: React.ReactNode }) {
  return (
    <span className="kpi-count text-2xl font-extrabold text-ink tabular-nums">{children}</span>
  );
}

function CountUpValue({ value, unit }: { value: number; unit: ValueUnit }) {
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const DURATION = 700;
    const start = performance.now();
    const from = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // Ease-out cubic: fast start, settles rather than stopping dead.
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <ValueText>{fmtByUnit(shown, unit)}</ValueText>;
}

/**
 * Period-over-period change.
 *
 * Direction is carried by an arrow glyph as well as colour, never colour alone —
 * the existing DeltaChip got this right and it must survive the rewrite.
 */
export function DeltaChip({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const flat = Math.abs(pct) < 0.05;
  const rising = pct > 0;
  const good = invert ? !rising : rising;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        flat ? "text-ink-soft" : good ? "text-emerald-600" : "text-red-600"
      }`}
    >
      <span aria-hidden="true">{flat ? "→" : rising ? "↑" : "↓"}</span>
      {Math.abs(pct).toFixed(1)}%
      <span className="sr-only">
        {flat ? "no change" : rising ? "up" : "down"} versus the previous period
      </span>
    </span>
  );
}

/** Where this rate sits against the platform's typical band. */
function BenchmarkBar({ value, low, high }: { value: number; low: number; high: number }) {
  // Scale to 1.5x the top of the band so an above-band value still fits.
  const scale = Math.max(high * 1.5, value * 1.1, 1);
  const pos = Math.min(100, (value / scale) * 100);
  const bandLeft = (low / scale) * 100;
  const bandWidth = ((high - low) / scale) * 100;
  const verdict = value < low ? "below typical" : value > high ? "above typical" : "typical";

  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-surface" aria-hidden="true">
        <div
          className="absolute inset-y-0 rounded-full bg-tint-emerald"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        <div
          className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-ink"
          style={{ left: `${pos}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {verdict} · {low}–{high}%
      </p>
    </div>
  );
}
