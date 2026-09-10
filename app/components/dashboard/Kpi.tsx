"use client";

// The KPI tile family, plus the two pieces every tile is built from.

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Animated count-up that lands on the exact formatted value. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const ref = useRef(value);
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(ref.current === value ? 0 : ref.current, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    ref.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <>{format(display)}</>;
}

/**
 * Percentage change chip.
 *
 * `invert` is for metrics where down is good — unsubscribes, cost per render.
 * The Social Tracker's own copy of this had it and admin's did not, so merging
 * them without it would have quietly flipped the colour on those tiles.
 */
export function DeltaChip({ pct: delta, invert = false }: { pct: number | null | undefined; invert?: boolean }) {
  if (delta == null) return <span className="text-[11px] text-fg-subtle">—</span>;
  const flat = Math.abs(delta) < 0.05;
  const good = invert ? delta < 0 : delta > 0;
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        flat ? "text-fg-subtle" : good ? "text-success" : "text-error"
      }`}
    >
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function Kpi({
  icon,
  label,
  value,
  format,
  delta,
  invertDelta,
  sub,
  spark,
  tooltip,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | null;
  format: (n: number) => string;
  delta?: number | null;
  invertDelta?: boolean;
  sub?: string;
  /**
   * The sparkline itself, not its data. Admin draws one with Recharts and the
   * Social Tracker with its own SVG kit — passing a node is what lets this tile
   * be shared without dragging ~100kB of d3 onto a customer route.
   */
  spark?: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div
      className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm p-4 transition-shadow hover:shadow-md flex flex-col"
      title={tooltip}
    >
      <div className="flex items-center gap-1.5 text-fg-subtle mb-1.5">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="text-[11px] font-semibold">{label}</span>
        {delta !== undefined && (
          <span className="ml-auto">
            <DeltaChip pct={delta} invert={invertDelta} />
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-fg leading-none tracking-tight">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {sub && <p className="text-[10px] text-fg-subtle mt-1.5">{sub}</p>}
      {spark && <div className="mt-auto pt-2.5">{spark}</div>}
    </div>
  );
}

export function MiniKpi({
  label,
  value,
  format,
  delta,
  invertDelta,
  sub,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  delta?: number | null;
  invertDelta?: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-panel rounded-[var(--radius-card)] border border-line shadow-sm px-4 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-subtle truncate">{label}</p>
      <p className="text-lg font-extrabold text-fg leading-tight mt-1">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {delta !== undefined ? (
        <DeltaChip pct={delta} invert={invertDelta} />
      ) : sub ? (
        <p className="text-[10px] text-fg-subtle">{sub}</p>
      ) : null}
    </div>
  );
}

/**
 * A tile for a metric the product cannot currently measure. Says so, rather
 * than printing a zero that reads as data.
 */
export function PlaceholderKpi({ label, needs }: { label: string; needs: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-subtle truncate">{label}</p>
      <p className="text-lg font-extrabold text-fg-subtle leading-tight mt-1">—</p>
      <p className="text-[10px] text-fg-subtle">{needs}</p>
    </div>
  );
}
