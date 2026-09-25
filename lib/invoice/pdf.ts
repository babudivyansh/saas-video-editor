// GST tax invoice PDF — the "minimal" layout the user chose (2026-09-25):
// the amount paid up top, From / Billed-to side by side, one line item and a
// short tax summary.
//
// Light surface on purpose: a PDF is printed, filed and forwarded to an
// accountant, which puts it with email/OG images in DESIGN_SYSTEM.md's list of
// surfaces that stay light. Colours are the email's light-surface emeralds
// (lib/email/tokens.ts), not the app's dark-tuned ones.
//
// Amounts print as "INR 1,000.00", not "₹": pdfkit's built-in Helvetica has no
// rupee glyph, and "INR" is the conventional form on Indian tax invoices.

import PDFDocument from "pdfkit";
import type { Invoice } from "@prisma/client";
import { COLOR } from "@/lib/email/tokens";
import { addressLines, formatInvoiceDate as fmtDate, stateLabel } from "./format";
import { GST_RATE_PERCENT, SELLER } from "./seller";
import { amountInWords, formatPaiseAmount } from "./tax";

const INK = COLOR.ink;
const SOFT = COLOR.muted;
const FAINT = COLOR.faint;
const BRAND = COLOR.brand;
const RULE = COLOR.border;
const MARGIN = 48;
const PAGE_W = 595.28; // A4
const CONTENT_W = PAGE_W - MARGIN * 2;
const RIGHT = PAGE_W - MARGIN;

const inr = (paise: number) => `INR ${formatPaiseAmount(paise)}`;

export interface InvoicePdfOptions {
  /** A purchase refunded after issue still has its invoice; say so on it. */
  refunded?: boolean;
}

export async function renderInvoicePdf(inv: Invoice, opts: InvoicePdfOptions = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: { Title: `Tax Invoice ${inv.number}`, Author: inv.sellerName, Subject: `Tax Invoice ${inv.number}` },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const rule = (y: number) => doc.moveTo(MARGIN, y).lineTo(RIGHT, y).lineWidth(0.75).strokeColor(RULE).stroke();

  // ── Header ────────────────────────────────────────────────────────────────
  let y = MARGIN;
  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND).text("Clipiro", MARGIN, y);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text("Tax Invoice", MARGIN, y + 2, { width: CONTENT_W, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(FAINT).text("Original for Recipient", MARGIN, y + 20, { width: CONTENT_W, align: "right" });
  y += 44;
  rule(y);

  // ── Amount hero + status pill ─────────────────────────────────────────────
  y += 22;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK)
    .text(`${inr(inv.total)} paid on ${fmtDate(inv.paidAt)}`, MARGIN, y, { width: CONTENT_W - 90 });
  const pill = opts.refunded ? "REFUNDED" : "PAID";
  const pillFg = opts.refunded ? COLOR.warning : COLOR.success;
  const pillBg = opts.refunded ? COLOR.warningSoft : COLOR.successSoft;
  doc.font("Helvetica-Bold").fontSize(9);
  const pillW = doc.widthOfString(pill) + 20;
  doc.roundedRect(RIGHT - pillW, y + 2, pillW, 20, 10).fill(pillBg);
  doc.fillColor(pillFg).text(pill, RIGHT - pillW, y + 8, { width: pillW, align: "center" });
  y = Math.max(doc.y, y + 24) + 18;

  // ── Meta rows ─────────────────────────────────────────────────────────────
  const meta: Array<[string, string]> = [
    ["Invoice number", inv.number],
    ["Invoice date", fmtDate(inv.issuedAt)],
    ["Payment ID", `${inv.paymentRef} (Razorpay)`],
    ["Place of supply", stateLabel(inv.placeOfSupply)],
    ["Reverse charge", "No"],
  ];
  for (const [label, value] of meta) {
    doc.font("Helvetica").fontSize(9.5).fillColor(SOFT).text(label, MARGIN, y, { width: 120 });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(value, MARGIN + 120, y, { width: CONTENT_W - 120 });
    y += 16;
  }
  y += 18;

  // ── From / Billed to ──────────────────────────────────────────────────────
  const colW = (CONTENT_W - 24) / 2;
  const colX2 = MARGIN + colW + 24;
  const column = (x: number, title: string, lines: string[]): number => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(FAINT).text(title, x, y, { width: colW, characterSpacing: 0.8 });
    let cy = y + 15;
    lines.forEach((line, i) => {
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(i === 0 ? INK : SOFT);
      doc.text(line, x, cy, { width: colW });
      cy = doc.y + 2;
    });
    return cy;
  };
  const fromEnd = column(MARGIN, "FROM", [
    inv.sellerName,
    ...addressLines(inv.sellerAddress),
    `GSTIN ${inv.sellerGstin}`,
  ]);
  const buyerLines = [
    inv.buyerName,
    inv.buyerAddress ?? "",
    [stateLabel(inv.buyerState), inv.buyerPincode].filter(Boolean).join(" – "),
    inv.buyerGstin ? `GSTIN ${inv.buyerGstin}` : "",
    inv.buyerEmail,
  ].filter(Boolean);
  const toEnd = column(colX2, "BILLED TO", buyerLines);
  y = Math.max(fromEnd, toEnd) + 20;

  // ── Line item ─────────────────────────────────────────────────────────────
  rule(y);
  y += 14;
  const amountW = 110;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK)
    .text(inv.description, MARGIN, y, { width: CONTENT_W - amountW - 12 });
  const descEnd = doc.y;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK)
    .text(inr(inv.taxable), RIGHT - amountW, y, { width: amountW, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(SOFT)
    .text(`SAC ${inv.sac}  ·  Qty 1  ·  Taxable value`, MARGIN, descEnd + 3, { width: CONTENT_W - amountW });
  y = doc.y + 14;
  rule(y);
  y += 14;

  // ── Tax summary ───────────────────────────────────────────────────────────
  const half = GST_RATE_PERCENT / 2;
  const summary: Array<[string, number, boolean]> = [
    ["Taxable value", inv.taxable, false],
    ...(inv.placeOfSupply !== inv.sellerState
      ? [[`IGST ${GST_RATE_PERCENT}%`, inv.igst, false] as [string, number, boolean]]
      : [
          [`CGST ${half}%`, inv.cgst, false] as [string, number, boolean],
          [`SGST ${half}%`, inv.sgst, false] as [string, number, boolean],
        ]),
    ["Total (incl. GST)", inv.total, true],
  ];
  const labelX = RIGHT - 280;
  for (const [label, paise, strong] of summary) {
    if (strong) {
      doc.moveTo(labelX, y - 4).lineTo(RIGHT, y - 4).lineWidth(0.75).strokeColor(RULE).stroke();
      y += 4;
    }
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11.5 : 9.5).fillColor(strong ? INK : SOFT)
      .text(label, labelX, y, { width: 150 });
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11.5 : 9.5).fillColor(INK)
      .text(inr(paise), RIGHT - 130, y, { width: 130, align: "right" });
    y += strong ? 20 : 16;
  }
  y += 10;

  doc.font("Helvetica-Oblique").fontSize(9).fillColor(SOFT).text(amountInWords(inv.total), MARGIN, y, { width: CONTENT_W });
  y = doc.y + 30;

  // ── Footer ────────────────────────────────────────────────────────────────
  rule(y);
  y += 12;
  doc.font("Helvetica").fontSize(8.5).fillColor(FAINT);
  doc.text(
    "This is a computer-generated invoice and does not require a signature. Tax is not payable on reverse charge basis.",
    MARGIN, y, { width: CONTENT_W },
  );
  doc.text(`Questions about this invoice? ${SELLER.supportEmail}`, MARGIN, doc.y + 4, { width: CONTENT_W });

  doc.end();
  return finished;
}

export function invoiceFilename(inv: Pick<Invoice, "number">): string {
  return `Clipiro-Invoice-${inv.number.replace(/\//g, "-")}.pdf`;
}
