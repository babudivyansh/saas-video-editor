// Read path shared by the customer receipt API, the customer PDF download and
// the admin PDF download: load the purchase, enforce ownership, and issue the
// invoice lazily if fulfilment's attempt never landed.

import type { Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureInvoice, invoiceEligibility, type IneligibleReason } from "./issue";

export interface PurchaseInvoice {
  purchase: {
    id: string;
    amountInPaise: number;
    currency: string;
    credits: number;
    status: string;
    createdAt: Date;
    plan: { name: string; slug: string } | null;
  };
  invoice: Invoice | null;
  /** Why there is no invoice, when there is none. */
  ineligible: IneligibleReason | null;
}

/**
 * `ownerId` scopes the lookup to one customer. A purchase belonging to anyone
 * else resolves to null — indistinguishable from a missing one, so ids cannot
 * be probed. Admin callers pass null to read any purchase.
 */
export async function loadPurchaseInvoice(purchaseId: string, ownerId: string | null): Promise<PurchaseInvoice | null> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, ...(ownerId ? { userId: ownerId } : {}) },
    select: {
      id: true, amountInPaise: true, currency: true, credits: true, status: true, createdAt: true,
      plan: { select: { name: true, slug: true } },
      invoice: true,
    },
  });
  if (!purchase) return null;

  const { invoice: existing, ...rest } = purchase;
  // An invoice already issued is always returned — including for a purchase
  // refunded afterwards, whose invoice remains a valid document of record.
  if (existing) return { purchase: rest, invoice: existing, ineligible: null };

  const ineligible = invoiceEligibility(purchase);
  if (ineligible) return { purchase: rest, invoice: null, ineligible };
  return { purchase: rest, invoice: await ensureInvoice(purchase.id), ineligible: null };
}
