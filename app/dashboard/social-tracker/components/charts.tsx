"use client";

// Small dependency-free SVG chart kit for the Social Tracker. Follows the
// dataviz method: thin marks (2px lines), recessive grid, text in text tokens
// (never the series color), hover crosshair + tooltip on every plot. Each chart
// draws ONE series — identity comes from the card/tile title, so no legend.

import { useRef, useState } from "react";

export interface SeriesPoint {
  date: string; // yyyy-mm-dd
  value: number;
}

export const fmtCompact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(n < 10 ? 1 : 0)}%`);

// Period-over-period change chip. Green up / red down / muted flat, with an
// arrow so the direction never relies on color alone.
export function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[11px] text-gray-400">—</span>;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        flat ? "text-gray-400" : up ? "text-emerald-600" : "text-red-600"
      }`}
    >
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function StatTile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {delta !== undefined && <DeltaChip pct={delta} />}
      </div>
    </div>
  );
}

export function LineChart({
  points,
  color,
  title,
  valueFmt = fmtCompact,
  height = 160,
}: {
  points: SeriesPoint[];
  color: string;
  title: string;
  valueFmt?: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = 600;
  const H = height;
  const PAD = { top: 10, right: 12, bottom: 22, left: 44 };

  if (points.length < 2) {
    return (
      <div className="border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
        <div className="h-24 flex items-center justify-center text-xs text-gray-400">
          Not enough history yet — check back after a few syncs.
        </div>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const gridYs = [0, 0.5, 1].map((f) => PAD.top + f * (H - PAD.top - PAD.bottom));
  const hovered = hover !== null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <div ref={wrapRef} className="relative border border-gray-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${title}: ${valueFmt(values[0])} to ${valueFmt(values[values.length - 1])}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridYs.map((gy) => (
          <line key={gy} x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#f3f4f6" strokeWidth="1" />
        ))}
        <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{valueFmt(max)}</text>
        <text x={PAD.left - 6} y={H - PAD.bottom + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{valueFmt(min)}</text>
        <text x={PAD.left} y={H - 6} fontSize="10" fill="#9ca3af">{points[0].date}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="10" fill="#9ca3af">{points[points.length - 1].date}</text>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hovered && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={H - PAD.bottom} stroke="#d1d5db" strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(hovered.value)} r="4" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg z-10"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: 4, transform: "translateX(-50%)" }}
        >
          <span className="text-gray-300">{hovered.date}</span> <span className="font-semibold">{valueFmt(hovered.value)}</span>
        </div>
      )}
      {/* Screen-reader table fallback */}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}><td>{p.date}</td><td>{valueFmt(p.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Horizontal magnitude bars in one hue — content-type mix. Values are labeled
// directly (text tokens), so no axis is needed.
export function TypeBars({
  items,
}: {
  items: Array<{ type: string; count: number; avgEngagementRate: number | null }>;
}) {
  if (items.length === 0) return null;
  const maxCount = Math.max(...items.map((i) => i.count));
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 mb-3">Content mix (posts in range)</p>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.type} className="flex items-center gap-2 text-xs" role="img" aria-label={`${i.type}: ${i.count} posts, ${fmtPct(i.avgEngagementRate)} avg engagement`}>
            <span className="w-16 text-gray-500 capitalize truncate">{i.type}</span>
            <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
              <div className="h-full rounded bg-blue-500" style={{ width: `${(i.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-semibold text-gray-700">{i.count}</span>
            <span className="w-14 text-right text-gray-400">{fmtPct(i.avgEngagementRate)} ER</span>
          </div>
        ))}
      </div>
    </div>
  );
}
