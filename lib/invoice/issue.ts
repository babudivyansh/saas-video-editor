// Issues GST tax invoices. The one place an Invoice row is ever created.
//
// Deliberately NOT inside the payment-fulfilment transaction: an invoice bug
// must never roll back a captured payment's credit grant. Instead issuance is
// idempotent and self-healing — fulfilment calls ensureInvoice right after it
// commits, and every read path (receipt page, PDF download) calls it again, so
// a purchase whose first attempt failed gets its invoice on the next look.

import { Prisma, type Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { GST_GO_LIVE, SAC_CODE, SELLER } from "./seller";
import { financialYear, formatInvoiceNumber, placeOfSupply, splitInclusive } from "./tax";

export type { Invoice };

interface EligibilityInput {
  currency: string;
  status: string;
  createdAt: Date;
}

export type IneligibleReason = "not-inr" | "before-go-live" | "not-captured";

/**
 * Whether a purchase gets a GST tax invoice.
 *
 * - USD is held back until the export treatment (LUT zero-rating vs IGST) is
 *   confirmed with the CA — those keep the plain receipt.
 * - Nothing captured before registration can carry a GSTIN.
 * - A purchase refunded before it was ever invoiced needs no invoice. (One
 *   refunded AFTER issue keeps its invoice; the reversal is a credit note.)
 */
export function invoiceEligibility(p: EligibilityInput): IneligibleReason | null {
  if (p.currency.toUpperCase() !== "INR") return "not-inr";
  if (p.createdAt < GST_GO_LIVE) return "before-go-live";
  if (p.status !== "captured") return "not-captured";
  return null;
}

/** "Clipiro Pro — monthly subscription (1,000 credits)". */
export function describePurchase(plan: { name: string; kind: string; intervalMonths: number | null } | null, credits: number): string {
  const creditsText = `${credits.toLocaleString("en-IN")} credits`;
  if (!plan) return `Clipiro credit pack (${creditsText})`;
  if (plan.kind === "subscription") {
    const m = plan.intervalMonths ?? 1;
    const term = m === 1 ? "monthly" : m === 12 ? "annual" : `${m}-month`;
    return `Clipiro ${plan.name} — ${term} subscription (${creditsText})`;
  }
  return `Clipiro ${plan.name} — credit pack (${creditsText})`;
}

/**
 * Return the purchase's invoice, issuing it first if it is eligible and has
 * none. Returns null for an ineligible purchase (or an unknown id).
 *
 * Gapless numbering: the counter bump and the Invoice insert share one
 * transaction, so any failure — including losing a race to a concurrent
 * ensureInvoice for the same purchase — rolls the bump back with it.
 */
export async function ensureInvoice(purchaseId: string): Promise<Invoice | null> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      invoice: true,
      plan: { select: { name: true, kind: true, intervalMonths: true } },
      user: {
        select: {
          email: true, name: true, firstName: true, lastName: true,
          billingName: true, billingAddress: true, billingState: true, billingPincode: true, billingGstin: true,
        },
      },
    },
  });
  if (!purchase) return null;
  if (purchase.invoice) return purchase.invoice;
  if (invoiceEligibility(purchase)) return null;

  const u = purchase.user;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
  const pos = placeOfSupply(u.billingState, SELLER.state);
  const split = splitInclusive(purchase.amountInPaise, pos === SELLER.state);
  const issuedAt = new Date();
  const fy = financialYear(issuedAt);

  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ last: number }>>`
        INSERT INTO "InvoiceCounter" ("fy", "last") VALUES (${fy}, 1)
        ON CONFLICT ("fy") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
        RETURNING "last"`;
      const seq = Number(rows[0].last);
      return tx.invoice.create({
        data: {
          number: formatInvoiceNumber(fy, seq),
          fy,
          seq,
          purchaseId: purchase.id,
          userId: purchase.userId,
          issuedAt,
          paidAt: purchase.createdAt,
          sellerName: SELLER.name,
          sellerAddress: SELLER.address,
          sellerGstin: SELLER.gstin,
          sellerState: SELLER.state,
          buyerName: u.billingName?.trim() || u.name?.trim() || fullName || u.email,
          buyerEmail: u.email,
          buyerAddress: u.billingAddress,
          buyerState: u.billingState,
          buyerPincode: u.billingPincode,
          buyerGstin: u.billingGstin,
          placeOfSupply: pos,
          description: describePurchase(purchase.plan, purchase.credits),
          sac: SAC_CODE,
          currency: "INR",
          ...split,
          paymentRef: purchase.id,
        },
      });
    });
  } catch (e) {
    // A concurrent call issued it first; ours rolled back, counter included.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.invoice.findUnique({ where: { purchaseId } });
      if (existing) return existing;
    }
    throw e;
  }
}

/** Best-effort variant for fulfilment: never throws, logs instead. */
export async function tryEnsureInvoice(purchaseId: string): Promise<Invoice | null> {
  try {
    return await ensureInvoice(purchaseId);
  } catch (e) {
    // Not fatal: the receipt page and PDF download re-attempt issuance.
    logger.error("invoice", `could not issue invoice for purchase ${purchaseId}`, e);
    return null;
  }
}
