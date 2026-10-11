import type { Invoice } from "@clipiro/shared";
import { invoiceFilename } from "@/lib/invoice/pdf";
import { prisma } from "@/lib/prisma";

// The app's read-only billing (docs/mobile/BILLING.md, B1–B3 A): purchases
// made on the web and their invoices. Nothing here sells.

const STATUS: Record<string, Invoice["status"]> = { captured: "paid", paid: "paid", refunded: "refunded", failed: "failed" };

type Row = {
  id: string;
  amountInPaise: number;
  currency: string;
  credits: number;
  minutes: number;
  status: string;
  createdAt: Date;
  plan: { name: string } | null;
  invoice: { number: string } | null;
};

function label(p: Row): string {
  if (p.plan) return `${p.plan.name} plan`;
  if (p.minutes > 0 && p.credits > 0) return `${p.minutes} minutes + ${p.credits} credits`;
  if (p.minutes > 0) return `${p.minutes} Clip Minutes`;
  return `${p.credits} AI credits`;
}

export function toInvoice(p: Row): Invoice {
  return {
    id: p.id,
    label: label(p),
    amount: p.amountInPaise,
    currency: p.currency,
    status: STATUS[p.status] ?? "pending",
    invoiceNumber: p.invoice?.number ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  amountInPaise: true,
  currency: true,
  credits: true,
  minutes: true,
  status: true,
  createdAt: true,
  plan: { select: { name: true } },
  invoice: { select: { number: true } },
} as const;

export async function listInvoices(userId: string): Promise<Invoice[]> {
  const rows = await prisma.purchase.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: SELECT });
  return rows.map(toInvoice);
}

export async function getInvoice(userId: string, id: string): Promise<{ invoice: Invoice; fileName: string | null } | null> {
  const row = await prisma.purchase.findFirst({ where: { id, userId }, select: SELECT });
  if (!row) return null;
  return { invoice: toInvoice(row), fileName: row.invoice ? invoiceFilename(row.invoice) : null };
}
