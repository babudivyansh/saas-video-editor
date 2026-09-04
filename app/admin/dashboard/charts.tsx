"use client";

// Recharts wrappers for the executive dashboard. Dataviz rules applied: one
// axis, thin marks, recessive grid, validated categorical palette with direct
// labels, text in text tokens; every chart's data is also CSV-exportable via
// its ChartContainer, which doubles as the accessible fallback.

import { useId, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  Pie, PieChart, RadialBar, RadialBarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BRAND, PALETTE, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, compact, inr } from "./ui";

// Recessive on the dark surface. Was #f3f4f6 — a near-white grid, which on
// #050908 is the loudest thing in the chart.
const GRID = "var(--line)";
const AXIS_TICK = { fontSize: 10, fill: "var(--fg-subtle)" } as const;

export function SparkArea({ data, color = BRAND }: { data: Array<{ date: string; value: number }>; color?: string }) {
  if (data.length < 2) return <div className="h-9" />;
  return (
    <div className="h-9" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RevenuePoint {
  date: string;
  revenueInPaise: number;
  refundsInPaise: number;
  purchases: number;
}

export function RevenueAreaChart({
  data,
  previous,
  mrrInPaise,
}: {
  data: RevenuePoint[];
  previous: RevenuePoint[] | null;
  mrrInPaise?: number | null;
}) {
  const [show, setShow] = useState({ revenue: true, refunds: true, previous: true });
  // Gradient ids must be unique per mounted chart — two instances sharing an
  // id would both resolve to whichever <defs> rendered last.
  const uid = useId().replace(/:/g, "");
  // Align the previous window by index so it overlays the current one.
  const merged = data.map((d, i) => ({
    ...d,
    previousInPaise: previous?.[i]?.revenueInPaise ?? null,
  }));
  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }));

  if (data.length === 0) {
    return <p className="text-xs text-fg-subtle py-10 text-center">No purchases in this range yet.</p>;
  }

  return (
    <div>
      <div className="flex gap-3 mb-2 text-[11px] font-semibold" role="group" aria-label="Toggle series">
        {([
          ["revenue", "Revenue", BRAND],
          ["refunds", "Refunds", PALETTE[4]],
          ...(previous ? ([["previous", "Previous period", "var(--fg-subtle)"]] as const) : []),
        ] as Array<[keyof typeof show, string, string]>).map(([key, label, color]) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            aria-pressed={show[key]}
            className={`inline-flex items-center gap-1.5 cursor-pointer ${show[key] ? "text-fg" : "text-fg-subtle line-through"}`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
            {label}
          </button>
        ))}
        {mrrInPaise != null && mrrInPaise > 0 && (
          <span className="ml-auto text-fg-subtle font-normal">MRR {inr(mrrInPaise)} · ARR {inr(mrrInPaise * 12)}</span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={`rev-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.34} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`ref-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PALETTE[4]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={PALETTE[4]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${compact(v / 100)}`} width={52} />
            <Tooltip
              formatter={(value, name) => [inr(Number(value)), String(name)]}
              contentStyle={TOOLTIP_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={{ ...TOOLTIP_LABEL_STYLE, fontSize: 11 }}
            />
            {show.previous && previous && (
              <Line type="monotone" dataKey="previousInPaise" name="Previous period" stroke="var(--fg-subtle)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            )}
            {show.revenue && (
              <Area type="monotone" dataKey="revenueInPaise" name="Revenue" stroke={BRAND} strokeWidth={2} fill={`url(#rev-${uid})`} fillOpacity={1} />
            )}
            {show.refunds && (
              <Area type="monotone" dataKey="refundsInPaise" name="Refunds" stroke={PALETTE[4]} strokeWidth={1.5} fill={`url(#ref-${uid})`} fillOpacity={1} />
            )}
            {data.length > 14 && <Brush dataKey="date" height={18} travellerWidth={8} stroke="var(--line-strong)" fill="var(--surface-2)" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GrowthLineChart({ daily }: { daily: Array<{ date: string; value: number }> }) {
  const [bucket, setBucket] = useState<"daily" | "weekly">("daily");
  const data =
    bucket === "daily"
      ? daily
      : Object.entries(
          daily.reduce<Record<string, number>>((acc, d) => {
            const dt = new Date(d.date);
            const week = new Date(dt);
            week.setDate(dt.getDate() - dt.getDay());
            const key = week.toISOString().slice(0, 10);
            acc[key] = (acc[key] ?? 0) + d.value;
            return acc;
          }, {}),
        ).map(([date, value]) => ({ date, value }));

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(["daily", "weekly"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBucket(b)}
            aria-pressed={bucket === b}
            className={`text-[11px] font-semibold px-2 py-1 rounded-lg capitalize cursor-pointer ${bucket === b ? "bg-surface-3 text-fg" : "text-fg-subtle"}`}
          >
            {b}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-fg-subtle self-center">Returning users: needs activity events — not tracked yet</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Line type="monotone" dataKey="value" name="New users" stroke={BRAND} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Donut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ name: string; value: number; isCost?: boolean }>;
  centerLabel: string;
  centerValue: string;
}) {
  const nonZero = slices.filter((s) => s.value > 0);
  if (nonZero.length === 0) return <p className="text-xs text-fg-subtle py-10 text-center">No data in range.</p>;
  return (
    <div className="relative">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={nonZero} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
              {nonZero.map((s, i) => (
                <Cell key={s.name} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [inr(Number(value)), String(name)]} contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-extrabold text-fg">{centerValue}</span>
          <span className="text-[10px] text-fg-subtle">{centerLabel}</span>
        </div>
      </div>
      {/* Direct labels — required by the palette's tritan-band pair, good practice anyway */}
      <ul className="grid grid-cols-2 gap-1 mt-2">
        {nonZero.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
            <span className="text-fg-muted truncate">{s.name}{s.isCost ? " (cost)" : ""}</span>
            <span className="ml-auto font-semibold text-fg">{inr(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Gauge({ successPct, chips }: { successPct: number | null; chips: Array<{ label: string; value: number; tone?: "bad" | "warn" }> }) {
  const value = successPct ?? 0;
  const data = [{ name: "success", value, fill: value >= 95 ? "#0d9488" : value >= 80 ? "#d97706" : "#e11d48" }];
  return (
    <div>
      <div className="h-40 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} innerRadius="72%" outerRadius="100%" startAngle={220} endAngle={-40}>
            <RadialBar dataKey="value" background={{ fill: GRID }} cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-fg">{successPct == null ? "—" : `${successPct.toFixed(1)}%`}</span>
          <span className="text-[10px] text-fg-subtle">success rate</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              c.tone === "bad" && c.value > 0 ? "bg-error/10 text-error" : c.tone === "warn" && c.value > 0 ? "bg-warning/10 text-warning" : "bg-surface-2 text-fg-muted"
            }`}
          >
            {c.value} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBars({
  items,
  valueFmt = compact,
}: {
  items: Array<{ label: string; value: number; sub?: string }>;
  valueFmt?: (n: number) => string;
}) {
  if (items.length === 0) return <p className="text-xs text-fg-subtle py-6 text-center">No data in range.</p>;
  const h = Math.max(120, items.length * 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={110} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => valueFmt(Number(value))} contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
          <Bar
            dataKey="value"
            fill={BRAND}
            radius={[0, 4, 4, 0]}
            barSize={14}
            label={{
              position: "right",
              fontSize: 10,
              fill: "var(--fg-muted)",
              formatter: (v) => (typeof v === "number" ? valueFmt(v) : String(v ?? "")),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const EMPTY = <p className="text-xs text-fg-subtle py-6 text-center">No data in range.</p>;

type Row = { date: string } & Record<string, string | number>;
export interface SeriesDef { key: string; name: string; color?: string }

// ── Stacked bars over time ───────────────────────────────────────────────────
// `percent` normalises each bar to its own total, so the chart reads as
// composition over time rather than volume — the right form for deliverability
// or status mix, where the question is "what share failed", not "how many".
export function StackedBars({
  data, series, height = 200, percent = false, valueFmt = compact,
}: {
  data: Row[];
  series: SeriesDef[];
  height?: number;
  percent?: boolean;
  valueFmt?: (n: number) => string;
}) {
  if (data.length === 0) return EMPTY;

  const rows: Row[] = percent
    ? data.map((row) => {
        const total = series.reduce((s, k) => s + Number(row[k.key] ?? 0), 0);
        if (total <= 0) return row;
        const out: Row = { date: row.date };
        for (const k of series) out[k.key] = (Number(row[k.key] ?? 0) / total) * 100;
        return out;
      })
    : data;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={percent ? 36 : 34}
            allowDecimals={false}
            domain={percent ? [0, 100] : undefined}
            tickFormatter={percent ? (v: number) => `${v}%` : undefined}
          />
          <Tooltip
            formatter={(value, name) => [percent ? `${Number(value).toFixed(1)}%` : valueFmt(Number(value)), String(name)]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="a"
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              radius={i === series.length - 1 ? [2, 2, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Diverging area ───────────────────────────────────────────────────────────
// Two quantities mirrored around a zero axis — credits granted above, spent
// below. Callers pass both as POSITIVE numbers; the down series is negated
// here so the axis is a real zero rather than a drawn line the data floats off.
export function DivergingArea({
  data, up, down, height = 220, valueFmt = compact,
}: {
  data: Row[];
  up: SeriesDef;
  down: SeriesDef;
  height?: number;
  valueFmt?: (n: number) => string;
}) {
  if (data.length === 0) return EMPTY;
  const uid = useId().replace(/:/g, "");
  const upColor = up.color ?? PALETTE[1];
  const downColor = down.color ?? PALETTE[3];
  const rows = data.map((d) => ({ ...d, [down.key]: -Math.abs(Number(d[down.key] ?? 0)) }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`up-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={upColor} stopOpacity={0.32} />
              <stop offset="100%" stopColor={upColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`dn-${uid}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={downColor} stopOpacity={0.32} />
              <stop offset="100%" stopColor={downColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={42} tickFormatter={(v: number) => valueFmt(Math.abs(v))} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip
            formatter={(value, name) => [valueFmt(Math.abs(Number(value))), String(name)]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
          />
          <Area type="monotone" dataKey={up.key} name={up.name} stroke={upColor} strokeWidth={1.75} fill={`url(#up-${uid})`} fillOpacity={1} />
          <Area type="monotone" dataKey={down.key} name={down.name} stroke={downColor} strokeWidth={1.75} fill={`url(#dn-${uid})`} fillOpacity={1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Multi-line ───────────────────────────────────────────────────────────────
export function MultiLine({
  data, series, height = 200, valueFmt = compact, yWidth = 34,
}: {
  data: Row[];
  series: SeriesDef[];
  height?: number;
  valueFmt?: (n: number) => string;
  yWidth?: number;
}) {
  if (data.length === 0) return EMPTY;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={yWidth} tickFormatter={(v: number) => valueFmt(v)} />
          <Tooltip
            formatter={(value, name) => [valueFmt(Number(value)), String(name)]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={i === 0 ? 2 : 1.75}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────
// Deliberately not Recharts: a funnel's job is the step-to-step conversion
// number, which a bar chart states more plainly than a tapered polygon.
export function Funnel({
  steps, valueFmt = compact,
}: {
  steps: Array<{ name: string; value: number; color?: string }>;
  valueFmt?: (n: number) => string;
}) {
  if (steps.length === 0) return EMPTY;
  const top = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const share = top > 0 ? (s.value / top) * 100 : 0;
        const prev = i > 0 ? steps[i - 1].value : null;
        const stepPct = prev !== null && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <li key={s.name}>
            <div className="flex justify-between items-baseline text-[11.5px] mb-1">
              <span className="text-fg-muted">{s.name}</span>
              <span className="font-semibold text-fg">{valueFmt(s.value)}</span>
            </div>
            <div className="h-[18px] bg-surface-1 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md"
                style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: s.color ?? PALETTE[i % PALETTE.length] }}
              />
            </div>
            <p className="text-[10px] text-fg-subtle mt-1">
              {share.toFixed(0)}% of first step
              {stepPct !== null ? ` · ${stepPct.toFixed(0)}% carried from previous` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// ── Histogram ────────────────────────────────────────────────────────────────
export function Histogram({
  buckets, height = 180, color = BRAND, valueFmt = compact,
}: {
  buckets: Array<{ label: string; count: number }>;
  height?: number;
  color?: string;
  valueFmt?: (n: number) => string;
}) {
  if (buckets.length === 0) return EMPTY;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [valueFmt(Number(value)), "clips"]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
          />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────────────────
// CSS grid rather than Recharts — 168 cells of hour x weekday is a table, and
// Recharts has no cell mark. Opacity ramps the brand hue; an sr-only summary
// carries the peak for screen readers.
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Heatmap({
  cells, peakLabel,
}: {
  cells: Array<{ day: number; hour: number; value: number }>;
  peakLabel?: string | null;
}) {
  if (cells.length === 0) return EMPTY;
  const max = Math.max(...cells.map((c) => c.value), 0);
  const byKey = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.value]));

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[9.5px] text-fg-subtle py-0.5">
          {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {DAY_LABELS.flatMap((_, day) =>
              Array.from({ length: 24 }, (_, hour) => {
                const v = byKey.get(`${day}-${hour}`) ?? 0;
                const o = max > 0 ? 0.06 + (v / max) * 0.82 : 0.06;
                return (
                  <div
                    key={`${day}-${hour}`}
                    className="rounded-[2.5px]"
                    style={{ aspectRatio: "1", background: `color-mix(in oklab, ${BRAND} ${Math.round(o * 100)}%, transparent)` }}
                    title={`${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 — ${v}`}
                  />
                );
              }),
            )}
          </div>
          <div className="flex justify-between text-[9.5px] text-fg-subtle mt-1.5">
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
        </div>
      </div>
      {peakLabel && <p className="text-[10.5px] text-fg-subtle mt-3">Busiest: {peakLabel}</p>}
      <span className="sr-only">Generation volume by hour of day and day of week. Peak {peakLabel ?? "unknown"}.</span>
    </div>
  );
}

// ── Combo bar + line (dual axis) ─────────────────────────────────────────────
export function ComboBarLine({
  data, bar, line, height = 220, barFmt = compact, lineFmt = (n: number) => `${n.toFixed(0)}%`,
}: {
  data: Row[];
  bar: SeriesDef;
  line: SeriesDef;
  height?: number;
  barFmt?: (n: number) => string;
  lineFmt?: (n: number) => string;
}) {
  if (data.length === 0) return EMPTY;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
          <YAxis yAxisId="l" tick={AXIS_TICK} tickLine={false} axisLine={false} width={42} tickFormatter={(v: number) => barFmt(v)} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => lineFmt(v)} />
          <Tooltip
            formatter={(value, name) => [name === line.name ? lineFmt(Number(value)) : barFmt(Number(value)), String(name)]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
          />
          <Bar yAxisId="l" dataKey={bar.key} name={bar.name} fill={bar.color ?? PALETTE[3]} fillOpacity={0.55} radius={[2, 2, 0, 0]} />
          <Line yAxisId="r" type="monotone" dataKey={line.key} name={line.name} stroke={line.color ?? BRAND} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Placeholder ──────────────────────────────────────────────────────────────
// For a chart whose data does not exist yet. A skeleton axis and NO curve —
// drawing a shape here would be inventing a trend. `needs` says in one line
// what would make it real, so the gap is actionable rather than mysterious.
export function PlaceholderChart({ height = 150, needs }: { height?: number; needs: string }) {
  return (
    <div>
      <svg viewBox="0 0 320 132" className="w-full opacity-50" style={{ height }} aria-hidden preserveAspectRatio="none">
        <line x1="24" x2="24" y1="4" y2="118" stroke="var(--line)" strokeDasharray="3 4" />
        {[42, 80, 118].map((y) => (
          <line key={y} x1="24" x2="316" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4" />
        ))}
      </svg>
      <p className="text-[10.5px] text-fg-subtle leading-relaxed mt-2">{needs}</p>
    </div>
  );
}
