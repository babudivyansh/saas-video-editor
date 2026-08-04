// Value formatting shared by every chart, tile and export.
//
// Deliberately not inside a component: the PDF builder and the CSV exporter must
// format identically to the screen, or a downloaded report disagrees with the
// dashboard it came from.

export const fmtCompact = (n: number | null | undefined): string =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtFull = (n: number | null | undefined): string =>
  n == null ? "—" : Intl.NumberFormat("en").format(Math.round(n));

/** One decimal below 10, none above — precision where it carries information. */
export const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : `${n.toFixed(Math.abs(n) < 10 ? 1 : 0)}%`;

/** Seconds as a human duration: 45s, 3m 20s, 1h 04m. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// en-GB, not en: day-first ("3 Aug 2026") rather than month-first
// ("Aug 3, 2026"). Clipiro's audience is India-first, and day-first also avoids
// the 03/08 ambiguity entirely. Still a fixed locale rather than the viewer's —
// full date localisation belongs with the next-intl work, not here.

/** "3 Aug" — chart axes have no room for a year, and the range implies it. */
export function fmtDateShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** "3 Aug 2026" — for tooltips and exports, where ambiguity is not acceptable. */
export function fmtDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(d);
}

export type ValueUnit = "count" | "percent" | "seconds" | "ratio" | "score";

/** Format by unit, so a chart never prints seconds as a bare integer. */
export function fmtByUnit(value: number | null | undefined, unit: ValueUnit): string {
  switch (unit) {
    case "percent":
      return fmtPct(value);
    case "seconds":
      return fmtDuration(value);
    case "score":
      return value == null ? "—" : value.toFixed(0);
    case "ratio":
      return value == null ? "—" : value.toFixed(1);
    default:
      return fmtCompact(value);
  }
}
