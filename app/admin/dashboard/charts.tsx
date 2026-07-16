"use client";

// Recharts wrappers for the executive dashboard. Dataviz rules applied: one
// axis, thin marks, recessive grid, validated categorical palette with direct
// labels, text in text tokens; every chart's data is also CSV-exportable via
// its ChartContainer, which doubles as the accessible fallback.

import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BRAND, PALETTE, compact, inr } from "./ui";

const GRID = "#f3f4f6";
const AXIS_TICK = { fontSize: 10, fill: "#9ca3af" } as const;

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
  // Align the previous window by index so it overlays the current one.
  const merged = data.map((d, i) => ({
    ...d,
    previousInPaise: previous?.[i]?.revenueInPaise ?? null,
  }));
  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }));

  if (data.length === 0) {
    return <p className="text-xs text-gray-400 py-10 text-center">No purchases in this range yet.</p>;
  }

  return (
    <div>
      <div className="flex gap-3 mb-2 text-[11px] font-semibold" role="group" aria-label="Toggle series">
        {([
          ["revenue", "Revenue", BRAND],
          ["refunds", "Refunds", PALETTE[4]],
          ...(previous ? ([["previous", "Previous period", "#9ca3af"]] as const) : []),
        ] as Array<[keyof typeof show, string, string]>).map(([key, label, color]) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            aria-pressed={show[key]}
            className={`inline-flex items-center gap-1.5 cursor-pointer ${show[key] ? "text-gray-700" : "text-gray-300 line-through"}`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
            {label}
          </button>
        ))}
        {mrrInPaise != null && mrrInPaise > 0 && (
          <span className="ml-auto text-gray-400 font-normal">MRR {inr(mrrInPaise)} · ARR {inr(mrrInPaise * 12)}</span>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${compact(v / 100)}`} width={52} />
            <Tooltip
              formatter={(value, name) => [inr(Number(value)), String(name)]}
              labelStyle={{ fontSize: 11, color: "#6b7280" }}
              contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #f3f4f6" }}
            />
            {show.previous && previous && (
              <Line type="monotone" dataKey="previousInPaise" name="Previous period" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            )}
            {show.revenue && (
              <Area type="monotone" dataKey="revenueInPaise" name="Revenue" stroke={BRAND} strokeWidth={2} fill={BRAND} fillOpacity={0.08} />
            )}
            {show.refunds && (
              <Area type="monotone" dataKey="refundsInPaise" name="Refunds" stroke={PALETTE[4]} strokeWidth={1.5} fill={PALETTE[4]} fillOpacity={0.08} />
            )}
            {data.length > 14 && <Brush dataKey="date" height={18} travellerWidth={8} stroke="#d1d5db" fill="#fafafa" />}
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
            className={`text-[11px] font-semibold px-2 py-1 rounded-lg capitalize cursor-pointer ${bucket === b ? "bg-gray-100 text-gray-800" : "text-gray-400"}`}
          >
            {b}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 self-center">Returning users: needs activity events — not tracked yet</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #f3f4f6" }} />
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
  if (nonZero.length === 0) return <p className="text-xs text-gray-400 py-10 text-center">No data in range.</p>;
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
            <Tooltip formatter={(value, name) => [inr(Number(value)), String(name)]} contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #f3f4f6" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-extrabold text-gray-900">{centerValue}</span>
          <span className="text-[10px] text-gray-400">{centerLabel}</span>
        </div>
      </div>
      {/* Direct labels — required by the palette's tritan-band pair, good practice anyway */}
      <ul className="grid grid-cols-2 gap-1 mt-2">
        {nonZero.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
            <span className="text-gray-600 truncate">{s.name}{s.isCost ? " (cost)" : ""}</span>
            <span className="ml-auto font-semibold text-gray-800">{inr(s.value)}</span>
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
          <span className="text-2xl font-extrabold text-gray-900">{successPct == null ? "—" : `${successPct.toFixed(1)}%`}</span>
          <span className="text-[10px] text-gray-400">success rate</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              c.tone === "bad" && c.value > 0 ? "bg-red-50 text-red-700" : c.tone === "warn" && c.value > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-500"
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
  if (items.length === 0) return <p className="text-xs text-gray-400 py-6 text-center">No data in range.</p>;
  const h = Math.max(120, items.length * 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} width={110} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => valueFmt(Number(value))} contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #f3f4f6" }} />
          <Bar
            dataKey="value"
            fill={BRAND}
            radius={[0, 4, 4, 0]}
            barSize={14}
            label={{
              position: "right",
              fontSize: 10,
              fill: "#6b7280",
              formatter: (v) => (typeof v === "number" ? valueFmt(v) : String(v ?? "")),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
