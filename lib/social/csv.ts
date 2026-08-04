// Server-side CSV rendering for exports and reports.
//
// The browser-side twin lives in app/components/charts/export.ts. Both exist
// because one runs in the client bundle and one must not, but the escaping rule
// is identical and is the whole point of having a helper at all.

/**
 * Quote a cell, and neutralise the formula-injection vector.
 *
 * A cell starting with =, +, - or @ is EXECUTED as a formula by Excel and
 * Google Sheets when the file is opened. Post captions, competitor handles and
 * account display names all reach these exports, and every one of them is text
 * an attacker can choose. Prefixing with a quote makes the cell inert while
 * still reading correctly.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export type CsvRow = Array<string | number | null | undefined>;

/** Header + rows as CRLF-delimited CSV. */
export function toCsv(header: string[], rows: CsvRow[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * A downloadable CSV body.
 *
 * The BOM is not decoration: without it Excel reads the file in the system
 * codepage and mangles every non-ASCII caption, which for this product's
 * audience is most of them.
 */
export function csvBody(header: string[], rows: CsvRow[]): string {
  return `﻿${toCsv(header, rows)}`;
}

/** Safe `Content-Disposition` filename — no quotes, no path separators. */
export function csvFilename(parts: Array<string | null | undefined>): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .replace(/[^\w.-]/g, "_")
    .slice(0, 100);
  return `${slug || "export"}.csv`;
}
