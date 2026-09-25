// Pure GST arithmetic for tax-inclusive prices. Everything is integer paise,
// so the parts always sum to exactly what the customer paid — there is no
// floating-point round-off line to explain.

import { GST_RATE_PERCENT, INVOICE_PREFIX } from "./seller";

export interface TaxSplit {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * Split a tax-inclusive total (paise) into taxable value + GST.
 *
 * Intra-state supply (place of supply = seller's state) is CGST + SGST at half
 * the rate each; anything else is IGST at the full rate. An odd paisa of tax
 * goes to SGST so the two halves still sum to the tax exactly.
 */
export function splitInclusive(totalPaise: number, intraState: boolean, ratePercent = GST_RATE_PERCENT): TaxSplit {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) throw new Error(`invalid total: ${totalPaise}`);
  const taxable = Math.round((totalPaise * 100) / (100 + ratePercent));
  const tax = totalPaise - taxable;
  if (intraState) {
    const cgst = Math.floor(tax / 2);
    return { taxable, cgst, sgst: tax - cgst, igst: 0, total: totalPaise };
  }
  return { taxable, cgst: 0, sgst: 0, igst: tax, total: totalPaise };
}

/**
 * Place of supply for an online service (IGST Act s.12(2)): the recipient's
 * state when we have their address on record, otherwise the supplier's own
 * location — which makes an address-less B2C sale intra-state.
 */
export function placeOfSupply(buyerState: string | null | undefined, sellerState: string): string {
  return buyerState || sellerState;
}

// ── Financial year + numbering ────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Indian financial year key for an instant, evaluated in IST: "2627" for
 * 1 Apr 2026 – 31 Mar 2027. IST, not UTC, so a payment at 00:30 IST on 1 April
 * lands in the new year even though it is still 31 March in UTC.
 */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1; // April = month 3
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * "CLP/2627/000001" — 15 characters, inside Rule 46's 16-character limit, and
 * built only from the permitted characters (letters, digits, "/" and "-").
 */
export function formatInvoiceNumber(fy: string, seq: number): string {
  return `${INVOICE_PREFIX}/${fy}/${String(seq).padStart(6, "0")}`;
}

// ── Amount in words (Indian numbering) ────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** 12,34,567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven". */
export function integerToIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid number: ${n}`);
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${integerToIndianWords(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
}

/** 100050 paise → "Indian Rupees One Thousand and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const paisePart = p ? ` and ${belowHundred(p)} Paise` : "";
  return `Indian Rupees ${integerToIndianWords(rupees)}${paisePart} Only`;
}

/** 84746 → "847.46", 100000 → "1,000.00" (Indian digit grouping). */
export function formatPaiseAmount(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
