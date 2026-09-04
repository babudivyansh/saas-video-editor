"use client";

// Shared primitives for the executive dashboard: formatters, the validated
// categorical palette, animated counters, card/chart containers, leaderboards
// and health grids. Charts themselves live in ./charts.tsx (Recharts).

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Download, Maximize2, X } from "lucide-react";

// Re-validated with the dataviz palette script against the DARK chart surface
// (#0b1210) when the admin panel moved to the emerald theme. All five checks
// still pass unchanged — lightness band, chroma floor, CVD separation,
// normal-vision floor, contrast — so these hues are kept rather than remapped.
// The amber↔teal tritan pair still sits in the 6–8 band, legal because every
// categorical use direct-labels its slices/bars.
//
// These are deliberately NOT brand colours: a categorical palette wants hue
// spread for identity, and painting it emerald would collapse the series.
export const PALETTE = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#e11d48"] as const;

// Single-series colour, so this one DOES read as "the product's colour" and
// follows the brand. Not the UI's #20d68a: that is L 0.774, outside the
// 0.48–0.67 mark band, so this is the darker step that validates.
export const BRAND = "#00a968";

// Recharts writes the tooltip background as a WHITE inline style by default,
// which lands as a white card floating on the dark dashboard. A stylesheet
// cannot reach an inline style, so every <Tooltip> has to pass these.
export const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "var(--panel-raised)",
  color: "var(--fg)",
  boxShadow: "var(--elev-lg)",
} as const;
export const TOOLTIP_ITEM_STYLE = { color: "var(--fg)" } as const;
export const TOOLTIP_LABEL_STYLE = { color: "var(--fg-muted)" } as const;

export const inr = (paise: number | null | undefined) =>
  paise == null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
export const compact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Animated count-up that lands on the exact formatted value. Disabled under
// prefers-reduced-motion.
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

export function DeltaChip({ pct: delta }: { pct: number | null | undefined }) {
  if (delta == null) return <span className="text-[11px] text-fg-subtle">—</span>;
  const flat = Math.abs(delta) < 0.05;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${flat ? "text-fg-subtle" : up ? "text-success" : "text-error"}`}>
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | null>>) {
  if (rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => cell(r[h])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Card wrapper: title/subtitle, CSV export, fullscreen modal, hover lift.
export function ChartContainer({
  title,
  subtitle,
  csv,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  csv?: { filename: string; rows: Array<Record<string, string | number | null>> };
  children: React.ReactNode;
  className?: string;
}) {
  const [full, setFull] = useState(false);
  const body = (
    <div className={`bg-panel rounded-2xl border border-line shadow-sm p-5 transition-shadow hover:shadow-md ${full ? "fixed inset-4 z-50 overflow-auto" : className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-fg">{title}</h2>
          {subtitle && <p className="text-[11px] text-fg-subtle">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {csv && (
            <button
              onClick={() => downloadCsv(csv.filename, csv.rows)}
              className="p-1.5 text-fg-subtle hover:text-brand cursor-pointer"
              title="Export CSV"
              aria-label={`Export ${title} as CSV`}
            >
              <Download size={14} />
            </button>
          )}
          <button
            onClick={() => setFull((f) => !f)}
            className="p-1.5 text-fg-subtle hover:text-brand cursor-pointer"
            title={full ? "Close fullscreen" : "Fullscreen"}
            aria-label={full ? `Close ${title} fullscreen` : `Open ${title} fullscreen`}
          >
            {full ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
  return full ? (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={() => setFull(false)} aria-hidden />
      {body}
    </>
  ) : (
    body
  );
}

export function Skeleton({ h = "h-40" }: { h?: string }) {
  return <div className={`bg-surface-3 rounded-2xl animate-pulse ${h}`} aria-label="Loading" />;
}

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-panel rounded-2xl border border-line shadow-sm p-6 text-center">
      <p className="text-sm text-fg-muted mb-2">Couldn’t load this section.</p>
      <button onClick={onRetry} className="text-xs font-semibold text-brand cursor-pointer">Retry</button>
    </div>
  );
}

export function Leaderboard({
  title,
  items,
  csvName,
}: {
  title: string;
  subtitleRight?: string;
  items: Array<{ label: string; value: string; sub?: string; href?: string }>;
  csvName?: string;
}) {
  return (
    <ChartContainer
      title={title}
      csv={csvName ? { filename: csvName, rows: items.map((i) => ({ label: i.label, value: i.value, sub: i.sub ?? "" })) } : undefined}
    >
      {items.length === 0 ? (
        <p className="text-xs text-fg-subtle py-4">No data in range.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((i, idx) => {
            const inner = (
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-surface-2 text-[10px] font-bold text-fg-subtle flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="w-7 h-7 rounded-full bg-tint-blue text-brand text-[11px] font-bold flex items-center justify-center flex-shrink-0 uppercase">
                  {i.label.slice(0, 1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-fg truncate">{i.label}</span>
                  {i.sub && <span className="block text-[10px] text-fg-subtle truncate">{i.sub}</span>}
                </span>
                <span className="text-xs font-bold text-fg flex-shrink-0">{i.value}</span>
              </div>
            );
            return (
              <li key={`${i.label}-${idx}`}>
                {i.href ? (
                  <a href={i.href} className="block hover:bg-surface-2 rounded-lg -mx-1 px-1 py-0.5">{inner}</a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      )}
    </ChartContainer>
  );
}

export function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ok ? "bg-success" : "bg-error"}`} aria-hidden />
      <span className={ok ? "text-fg-muted" : "text-error font-semibold"}>{label}</span>
      <span className="sr-only">{ok ? "healthy" : "attention needed"}</span>
    </div>
  );
}
