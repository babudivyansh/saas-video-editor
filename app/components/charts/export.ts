// Chart export: CSV of the same data the sr-only table already shows.

import { fmtDateLong, type ValueUnit } from "./format";

export interface ExportSeries {
  key: string;
  label: string;
  unit: ValueUnit;
  points: Array<{ date: string; value: number }>;
}

/** One row per date, one column per series — the sr-only table, as a file. */
export function seriesToCsv(series: ExportSeries[], xLabel = "Date"): string {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))];
  if (xLabel === "Date") dates.sort();

  const lookup = series.map((s) => new Map(s.points.map((p) => [p.date, p.value])));
  const rows = [
    [xLabel, ...series.map((s) => s.label)],
    ...dates.map((date) => [
      xLabel === "Date" ? fmtDateLong(date) : date,
      // Raw numbers, not formatted ones: a CSV is opened in a spreadsheet, and
      // "1.2K" is not a number there. The screen formats; the file exports.
      ...lookup.map((map) => (map.has(date) ? String(map.get(date)) : "")),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * CSV quoting, including the leading-formula guard.
 *
 * A cell starting with =, +, - or @ is executed as a formula by Excel and
 * Sheets on open. Our own labels are safe, but post captions reach the content
 * export, and a caption is attacker-controlled text.
 */
function csvCell(value: string): string {
  const escaped = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** Trigger a download of a blob under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously races the download start
  // in Safari, which silently produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

