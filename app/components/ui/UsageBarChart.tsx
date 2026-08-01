"use client";

export interface UsageBarChartProps {
  data: { date: string; credits: number }[];
  height?: number;
}

// Hand-rolled, dependency-free bar chart — matches the app's existing
// sparkline/ring precedent (no charting library installed anywhere else).
// A day-bucketed credit-usage chart doesn't need a heavy library's
// zoom/pan/multi-series interactivity; a native <title> tooltip per bar is
// enough here.
export function UsageBarChart({ data, height = 120 }: UsageBarChartProps) {
  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-ink-soft">No usage yet</div>;
  }

  const max = Math.max(1, ...data.map(d => d.credits));
  const w = Math.max(data.length * 10, 100);
  const barW = (w / data.length) * 0.7;
  const gap = (w / data.length) * 0.3;

  const total = data.reduce((s, d) => s + d.credits, 0);

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
        aria-label={`Credit usage from ${data[0]?.date} to ${data[data.length - 1]?.date}: ${total} credit${total === 1 ? "" : "s"} in total, peaking at ${max} in a day.`}
      >
        <defs>
          <linearGradient id="usage-bar-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="55%" stopColor="var(--accent-violet)" />
            <stop offset="100%" stopColor="var(--accent-fuchsia)" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const barH = (d.credits / max) * (height - 16);
          const x = i * (barW + gap) + gap / 2;
          const y = height - barH - 2;
          return (
            <rect key={d.date} x={x} y={y} width={barW} height={Math.max(barH, 1)} rx={barW / 4} fill="url(#usage-bar-grad)">
              <title>{`${d.date}: ${d.credits} credit${d.credits === 1 ? "" : "s"}`}</title>
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
        <caption>Credit usage by day</caption>
        <thead><tr><th>Date</th><th>Credits</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.credits}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
