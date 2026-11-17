"use client";

export interface UsageBarChartProps {
  data: { date: string; value: number }[];
  /** What a bar counts, singular and plural — "credit"/"credits", "min"/"min". */
  unit?: { one: string; many: string };
  height?: number;
}

// Hand-rolled, dependency-free bar chart — matches the app's existing
// sparkline/ring precedent (no charting library installed anywhere else).
// A day-bucketed credit-usage chart doesn't need a heavy library's
// zoom/pan/multi-series interactivity; a native <title> tooltip per bar is
// enough here.
export function UsageBarChart({ data, unit = { one: "credit", many: "credits" }, height = 120 }: UsageBarChartProps) {
  const label = (n: number) => `${n} ${n === 1 ? unit.one : unit.many}`;
  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-ink-soft">No usage yet</div>;
  }

  const max = Math.max(1, ...data.map(d => d.value));
  const w = Math.max(data.length * 10, 100);
  const barW = (w / data.length) * 0.7;
  const gap = (w / data.length) * 0.3;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="w-full overflow-x-auto">
      {/* The <title> per bar is a mouse affordance only — it isn't reachable by
          keyboard and isn't announced, so the chart was previously an
          unlabelled graphic to a screen reader. role="img" + a summary label,
          with the full series in an sr-only table, mirrors the pattern already
          used by app/components/charts.tsx. */}
      <svg
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Usage from ${data[0]?.date} to ${data[data.length - 1]?.date}: ${label(total)} in total, peaking at ${max} in a day.`}
      >
        {data.map((d, i) => {
          const barH = (d.value / max) * (height - 16);
          const x = i * (barW + gap) + gap / 2;
          const y = height - barH - 2;
          return (
            <rect key={d.date} x={x} y={y} width={barW} height={Math.max(barH, 1)} rx={barW / 4} className="fill-primary">
              <title>{`${d.date}: ${label(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-soft mt-1 px-0.5" aria-hidden="true">
        <span>{data[0]?.date}</span>
        <span className="font-semibold">max {max}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
      <table className="sr-only">
        <caption>Usage by day</caption>
        <thead><tr><th>Date</th><th>{unit.many}</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
