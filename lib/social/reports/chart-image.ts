// Chart rasterization for the PDF, via @napi-rs/canvas (already a dependency).
//
// Drawn directly to a canvas rather than by rendering the React chart and
// screenshotting it: a headless browser to produce a 600×200 line chart is two
// orders of magnitude more machinery than the job needs, and it would put a
// Chromium download in the deploy path.
//
// The series data is identical to what the on-screen chart receives, so a chart
// in a PDF and the same chart in the dashboard are drawn from one source.

import { createCanvas } from "@napi-rs/canvas";

export interface ChartImageSeries {
  label: string;
  color: string;
  points: Array<{ date: string; value: number }>;
}

export interface ChartImageOptions {
  width?: number;
  height?: number;
  title?: string;
}

const PAD = { top: 28, right: 16, bottom: 26, left: 56 };
const INK = "#0b0d13";
const SOFT = "#6b7280";
const GRID = "#e6e8ee";

/**
 * Render a line chart to a PNG buffer.
 *
 * Returns null when there is nothing meaningful to draw. The caller then omits
 * the figure entirely — an empty pair of axes in a report reads as "we measured
 * zero", which is a different and wrong claim.
 */
export function renderLineChartPng(
  series: ChartImageSeries[],
  opts: ChartImageOptions = {},
): Buffer | null {
  const width = opts.width ?? 620;
  const height = opts.height ?? 220;

  const drawable = series.filter((s) => s.points.length >= 2);
  if (drawable.length === 0) return null;

  const dates = [...new Set(drawable.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const values = drawable.flatMap((s) => s.points.map((p) => p.value)).filter(Number.isFinite);
  if (values.length === 0) return null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would collapse onto one line and divide by zero on the way.
  const span = max - min || Math.abs(max) || 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (date: string) => PAD.left + (dates.indexOf(date) / Math.max(1, dates.length - 1)) * plotW;
  const y = (value: number) => PAD.top + plotH - ((value - min) / span) * plotH;

  if (opts.title) {
    ctx.fillStyle = INK;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(opts.title, PAD.left, 18);
  }

  // Gridlines and the y axis, at the two extremes and the midpoint — enough to
  // read the scale, few enough not to become the loudest thing on the page.
  ctx.strokeStyle = GRID;
  ctx.fillStyle = SOFT;
  ctx.font = "10px sans-serif";
  ctx.lineWidth = 1;
  for (const fraction of [0, 0.5, 1]) {
    const value = min + span * fraction;
    const py = y(value);
    ctx.beginPath();
    ctx.moveTo(PAD.left, py);
    ctx.lineTo(width - PAD.right, py);
    ctx.stroke();
    ctx.fillText(compact(value), 6, py + 3);
  }

  for (const s of drawable) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach((point, i) => {
      const px = x(point.date);
      const py = y(point.value);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  ctx.fillStyle = SOFT;
  ctx.font = "10px sans-serif";
  ctx.fillText(dates[0], PAD.left, height - 8);
  const lastLabel = dates[dates.length - 1];
  ctx.fillText(lastLabel, width - PAD.right - ctx.measureText(lastLabel).width, height - 8);

  if (drawable.length > 1) {
    // Legend along the top, left to right, only when there is more than one
    // line to tell apart.
    const legendY = PAD.top - 10;
    const legendX = drawable.reduce((cursor, s) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(cursor, legendY - 6, 8, 8);
      ctx.fillStyle = SOFT;
      ctx.fillText(s.label, cursor + 12, legendY + 1);
      return cursor + 12 + ctx.measureText(s.label).width + 14;
    }, PAD.left);
    void legendX;
  }

  return canvas.toBuffer("image/png");
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
