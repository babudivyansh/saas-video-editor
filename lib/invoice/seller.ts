// Seller-side invoice constants. Identity (name, address, GSTIN) comes from the
// one place it is defined — LEGAL in lib/email/tokens.ts — so an email footer
// and a tax invoice can never disagree about who we are.

import { LEGAL } from "@/lib/email/tokens";

export const SELLER = {
  name: LEGAL.entity,
  address: LEGAL.address,
  gstin: LEGAL.gstin,
  /** GST state code — the first two digits of the GSTIN (09 = Uttar Pradesh). */
  state: LEGAL.gstin.slice(0, 2),
  supportEmail: LEGAL.supportEmail,
} as const;

/**
 * Services Accounting Code printed on every line.
 *
 * ⚠ CONFIRM WITH THE CA. 998314 is "IT design and development services"; SaaS
 * is also commonly filed under 997331 (licensing of software) or 998315
 * (hosting). Changing it here affects only invoices issued afterwards — each
 * invoice snapshots its SAC.
 */
export const SAC_CODE = "998314";

/** GST rate on the service, in percent. Prices are tax-INCLUSIVE (see /terms). */
export const GST_RATE_PERCENT = 18;

/**
 * GST go-live. Purchases captured before this instant get no tax invoice —
 * one cannot be issued for a supply made before registration — and keep the
 * plain receipt instead.
 */
export const GST_GO_LIVE = new Date("2026-09-25T00:00:00+05:30");

/** Prefix of the invoice number series, e.g. CLP/2627/000001. */
export const INVOICE_PREFIX = "CLP";
