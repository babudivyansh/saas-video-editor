"use client";

// Tiny trend line inside a KPI tile.
//
// aria-hidden on purpose: the tile already states the value and the delta in
// text, and the full series is available in the chart below. Announcing 30 more
// numbers per tile would make the KPI grid unusable with a screen reader.

export function Sparkline({
  points,
  color = "var(--brand)",
  height = 24,
}: {
  points: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  const W = 100;
  const values = points.map((p) => p.value).filter(Number.isFinite);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and collapse onto the baseline.
  const span = max - min || 1;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => height - ((v - min) / span) * (height - 2) - 1;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      style={{ height }}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
