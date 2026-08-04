// Chart export: PNG, CSV, clipboard.
//
// No new dependency — XMLSerializer → Blob → Image → <canvas> → toBlob is the
// whole PNG path, and the CSV is the same data the sr-only table already shows.
//
// THE TRAP: CSS custom properties do not survive serialization. An SVG whose
// stroke is `var(--brand)` serializes with that literal text, and outside the
// document there is no `--brand` to resolve it, so every line renders black (or
// vanishes). So the clone is walked and every paint property is replaced with
// the COMPUTED value read from the live element before it is serialized.

import { fmtDateLong, fmtByUnit, type ValueUnit } from "./format";

export interface ExportSeries {
  key: string;
  label: string;
  unit: ValueUnit;
  points: Array<{ date: string; value: number }>;
}

/** Paint properties that can carry a custom property and must be flattened. */
const PAINT_PROPS = ["fill", "stroke", "stop-color", "color", "opacity", "fill-opacity", "stroke-opacity", "stroke-width"] as const;

/**
 * Deep-clone an SVG with every paint property resolved to a concrete value.
 *
 * Walks the live tree and the clone in lockstep, because getComputedStyle only
 * means anything for an element that is actually in the document.
 */
export function flattenSvgStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const liveNodes = [source, ...Array.from(source.querySelectorAll<SVGElement>("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];

  for (const [i, live] of liveNodes.entries()) {
    const target = cloneNodes[i];
    if (!target) continue;
    const computed = getComputedStyle(live);
    for (const prop of PAINT_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "none") target.setAttribute(prop, value.trim());
    }
  }

  // A background: SVG is transparent by default, and a transparent PNG pasted
  // into a deck or a document is unreadable dark-on-dark.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.style.background = "#ffffff";
  return clone;
}

export interface PngOptions {
  /** Multiplier over the SVG's viewBox size. 2 is a retina-sharp default. */
  scale?: number;
  background?: string;
}

/** Rasterize an on-screen SVG. Rejects if the browser refuses to load the blob. */
export async function svgToPngBlob(svg: SVGSVGElement, opts: PngOptions = {}): Promise<Blob> {
  const scale = opts.scale ?? 2;
  const flattened = flattenSvgStyles(svg);

  const viewBox = svg.viewBox.baseVal;
  const width = (viewBox?.width || svg.clientWidth || 600) * scale;
  const height = (viewBox?.height || svg.clientHeight || 200) * scale;

  const source = new XMLSerializer().serializeToString(flattened);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser");
    ctx.fillStyle = opts.background ?? "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the PNG"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render the chart image"));
    image.src = url;
  });
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

/** Human-readable values, for pasting into a message rather than a spreadsheet. */
export function seriesToText(series: ExportSeries[], xLabel = "Date"): string {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))];
  if (xLabel === "Date") dates.sort();
  const lookup = series.map((s) => new Map(s.points.map((p) => [p.date, p.value])));

  return [
    [xLabel, ...series.map((s) => s.label)].join("\t"),
    ...dates.map((date) =>
      [
        xLabel === "Date" ? fmtDateLong(date) : date,
        ...series.map((s, i) => {
          const map = lookup[i];
          return map.has(date) ? fmtByUnit(map.get(date)!, s.unit) : "—";
        }),
      ].join("\t"),
    ),
  ].join("\n");
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

export function downloadCsv(series: ExportSeries[], filename: string, xLabel = "Date"): void {
  // The BOM is what makes Excel read the file as UTF-8 rather than as the
  // system codepage, which mangles every non-ASCII caption.
  downloadBlob(new Blob([`﻿${seriesToCsv(series, xLabel)}`], { type: "text/csv;charset=utf-8" }), filename);
}

/** Slug for a downloaded file: "Follower growth" → "follower-growth". */
export function exportFilename(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "chart";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
