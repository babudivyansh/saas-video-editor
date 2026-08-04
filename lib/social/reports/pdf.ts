// PDF rendering, via pdfkit.
//
// STREAMED, not buffered as a document tree: an annual multi-account report
// with a rasterized chart per account is the case this has to survive, and
// pdfkit writes pages out as they are finished rather than holding the whole
// document in memory. The caller still collects the stream into a Buffer for
// upload, but peak memory is one page rather than forty.

import PDFDocument from "pdfkit";
import { renderLineChartPng } from "./chart-image";
import {
  EM_DASH, formatDate, kpiRows, shortCaption, type ReportModel,
} from "./data";

const INK = "#0b0d13";
const SOFT = "#6b7280";
const BRAND = "#335cff";
const RULE = "#e6e8ee";
const MARGIN = 48;

const SERIES_COLORS = [BRAND, "#7c3aed", "#d946ef", "#22c55e"];

export async function renderPdf(model: ReportModel): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  cover(doc, model);

  for (const account of model.accounts) {
    doc.addPage();
    heading(doc, `${account.label}`, `${account.provider} · ${formatDate(model.periodStart)} to ${formatDate(model.periodEnd)}`);

    if (model.sections.includes("kpis")) {
      table(
        doc,
        ["Metric", "Value", "Change"],
        kpiRows(account).slice(0, 14).map((r) => [r.metric, r.value, r.change]),
        [230, 150, 90],
      );
    }

    if (model.sections.includes("trends")) {
      const png = renderLineChartPng(
        account.series
          .filter((s) => s.points.length >= 2)
          .slice(0, 3)
          .map((s, i) => ({
            label: s.metric,
            color: SERIES_COLORS[i % SERIES_COLORS.length],
            points: s.points,
          })),
        { title: "Trend", width: 500, height: 180 },
      );
      // Omitted entirely when there is nothing to draw: an empty pair of axes
      // in a report reads as "we measured zero", which is a different claim.
      if (png) {
        doc.moveDown(0.8);
        ensureRoom(doc, 200);
        doc.image(png, { fit: [doc.page.width - MARGIN * 2, 190] });
        doc.moveDown(0.5);
      }
    }

    if (model.sections.includes("content") && account.topPosts.length > 0) {
      subheading(doc, "Top posts");
      table(
        doc,
        ["Published", "Type", "Caption", "Views", "ER %"],
        account.topPosts.slice(0, 10).map((p) => [
          formatDate(p.publishedAt),
          p.mediaType ?? EM_DASH,
          shortCaption(p.caption, 40),
          p.views === null ? EM_DASH : Intl.NumberFormat("en", { notation: "compact" }).format(p.views),
          p.engagementRate === null ? EM_DASH : p.engagementRate.toFixed(1),
        ]),
        [70, 55, 210, 70, 55],
      );
    }

    if (model.sections.includes("audience") && account.audience.length > 0) {
      subheading(doc, "Audience");
      table(
        doc,
        ["Population", "Dimension", "Bucket", "Value"],
        account.audience.slice(0, 15).map((r) => [
          r.audience, r.dimension, r.bucket,
          r.unit === "percent" ? `${r.value.toFixed(1)}%` : String(Math.round(r.value)),
        ]),
        [110, 110, 160, 90],
      );
    }
  }

  if (model.sections.includes("competitors") && model.competitors.length > 0) {
    doc.addPage();
    heading(doc, "Competitors", "Followers and engagement against your own accounts on the same platform");
    table(
      doc,
      ["Handle", "Platform", "Followers", "Gap", "ER %"],
      model.competitors.map((c) => [
        c.handle, c.provider,
        c.followers === null ? EM_DASH : Intl.NumberFormat("en").format(c.followers),
        c.followerGap === null ? EM_DASH : Intl.NumberFormat("en").format(c.followerGap),
        c.engagementRate === null ? EM_DASH : c.engagementRate.toFixed(1),
      ]),
      [140, 80, 100, 90, 60],
    );
  }

  if (model.goals.length > 0) {
    ensureRoom(doc, 160);
    subheading(doc, "Goals");
    table(
      doc,
      ["Metric", "Progress", "Target", "Days left", "Status"],
      model.goals.map((g) => [
        g.metric,
        g.pct === null ? EM_DASH : `${g.pct.toFixed(0)}%`,
        Intl.NumberFormat("en").format(g.target),
        String(g.daysRemaining),
        g.hit ? "hit" : g.onTrack === null ? "unknown" : g.onTrack ? "on track" : "behind",
      ]),
      [140, 80, 90, 70, 90],
    );
  }

  if (model.sections.includes("ai") && model.ai) {
    doc.addPage();
    heading(doc, "Summary", "Written from the figures in this report");
    doc.fillColor(INK).fontSize(10).text(model.ai.summary, { align: "left" });
    doc.moveDown(0.8);

    bulletList(doc, "What worked", model.ai.wins);
    bulletList(doc, "What to watch", model.ai.concerns);

    if (model.ai.recommendations.length > 0) {
      subheading(doc, "Recommendations");
      for (const rec of model.ai.recommendations) {
        ensureRoom(doc, 60);
        doc.fillColor(INK).fontSize(10).text(`• ${rec.title}`);
        doc.fillColor(SOFT).fontSize(9).text(rec.rationale, { indent: 12 });
        doc.moveDown(0.4);
      }
    }
  }

  footerEveryPage(doc, model);
  doc.end();
  return finished;
}

type Doc = InstanceType<typeof PDFDocument>;

function cover(doc: Doc, model: ReportModel): void {
  doc.fillColor(BRAND).fontSize(11).text("Clipiro · Social Tracker");
  doc.moveDown(1.5);
  doc.fillColor(INK).fontSize(24).text(model.title, { lineGap: 4 });
  doc.moveDown(0.5);
  doc
    .fillColor(SOFT)
    .fontSize(11)
    .text(`${formatDate(model.periodStart)} to ${formatDate(model.periodEnd)}`);
  doc.moveDown(2);

  doc.fillColor(INK).fontSize(12).text("Accounts in this report");
  doc.moveDown(0.4);
  for (const account of model.accounts) {
    doc
      .fillColor(SOFT)
      .fontSize(10)
      .text(
        `${account.label} (${account.provider}) — ${
          account.followers === null ? EM_DASH : Intl.NumberFormat("en").format(account.followers)
        } followers${account.healthScore === null ? "" : `, health ${account.healthScore.toFixed(0)}/100`}`,
      );
  }
}

function heading(doc: Doc, title: string, subtitle?: string): void {
  doc.fillColor(INK).fontSize(16).text(title);
  if (subtitle) doc.fillColor(SOFT).fontSize(9).text(subtitle);
  doc.moveDown(0.8);
}

function subheading(doc: Doc, title: string): void {
  ensureRoom(doc, 80);
  doc.moveDown(0.6);
  doc.fillColor(INK).fontSize(12).text(title);
  doc.moveDown(0.3);
}

/** Start a new page when the next block would not fit on this one. */
function ensureRoom(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN) doc.addPage();
}

function table(doc: Doc, headers: string[], rows: string[][], widths: number[]): void {
  const left = MARGIN;
  const rowHeight = 16;

  const drawHeader = () => {
    doc.fillColor(SOFT).fontSize(8);
    headers.forEach((headerText, i) => {
      doc.text(headerText.toUpperCase(), left + offset(widths, i), doc.y, {
        width: widths[i],
        continued: i < headers.length - 1,
      });
    });
    doc.moveDown(0.3);
    rule(doc);
  };

  ensureRoom(doc, rowHeight * 4);
  drawHeader();

  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    doc.fillColor(INK).fontSize(9);
    row.forEach((cell, i) => {
      doc.text(cell, left + offset(widths, i), y, { width: widths[i], height: rowHeight, ellipsis: true, lineBreak: false });
    });
    doc.y = y + rowHeight;
  }
  doc.moveDown(0.4);
}

function offset(widths: number[], index: number): number {
  return widths.slice(0, index).reduce((sum, w) => sum + w, 0);
}

function rule(doc: Doc): void {
  doc
    .strokeColor(RULE)
    .lineWidth(0.5)
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.3);
}

function bulletList(doc: Doc, title: string, items: string[]): void {
  if (items.length === 0) return;
  subheading(doc, title);
  for (const item of items) {
    ensureRoom(doc, 30);
    doc.fillColor(INK).fontSize(10).text(`• ${item}`);
  }
  doc.moveDown(0.4);
}

/**
 * Page numbers, written after the fact.
 *
 * bufferPages keeps the pages addressable so "page 3 of 12" can state a total
 * that is not known until the document is finished.
 */
function footerEveryPage(doc: Doc, model: ReportModel): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .fillColor(SOFT)
      .fontSize(8)
      .text(
        `Generated ${formatDate(model.generatedAt)} · page ${i - range.start + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - MARGIN + 10,
        { width: doc.page.width - MARGIN * 2, align: "center", lineBreak: false },
      );
  }
}
