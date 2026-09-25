"use client";

// Receipt / GST tax invoice for one purchase — the "minimal" layout chosen on
// 2026-09-25, matching the PDF (lib/invoice/pdf.ts): amount paid up top, From /
// Billed-to side by side, one line item, a short tax summary.
//
// Purchases with no tax invoice (USD, before GST go-live, refunded before
// issue) fall back to a plain payment receipt with the reason stated.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { addressLines, formatInvoiceDate as fmtDate, stateLabel } from "@/lib/invoice/format";
import { amountInWords, formatPaiseAmount } from "@/lib/invoice/tax";

interface Invoice {
  number: string;
  issuedAt: string;
  paidAt: string;
  sellerName: string;
  sellerAddress: string;
  sellerGstin: string;
  sellerState: string;
  buyerName: string;
  buyerEmail: string;
  buyerAddress: string | null;
  buyerState: string | null;
  buyerPincode: string | null;
  buyerGstin: string | null;
  placeOfSupply: string;
  description: string;
  sac: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paymentRef: string;
}

interface Data {
  purchase: {
    id: string;
    amountInPaise: number;
    currency: string;
    credits: number;
    status: string;
    createdAt: string;
    plan: { name: string; slug: string } | null;
  };
  invoice: Invoice | null;
  ineligible: "not-inr" | "before-go-live" | "not-captured" | null;
}

function money(minor: number, currency = "INR") {
  return currency === "USD" ? `$${(minor / 100).toFixed(2)}` : `₹${formatPaiseAmount(minor)}`;
}

const NO_INVOICE_REASON: Record<NonNullable<Data["ineligible"]>, string> = {
  "not-inr":
    "GST tax invoices for international (USD) payments aren't available yet. Need one for your records? Email support@clipiro.com.",
  "before-go-live": "This payment was made before Clipiro's GST registration, so it has a payment receipt rather than a tax invoice.",
  "not-captured": "This payment was refunded before a tax invoice was issued.",
};

function IcBack() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>; }
function IcDownload() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>; }

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1 text-sm">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={`text-fg break-all ${mono ? "font-mono text-[13px]" : ""}`}>{value}</dd>
    </div>
  );
}

function Party({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-fg-subtle uppercase tracking-widest mb-2">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className={`text-sm break-words ${i === 0 ? "font-semibold text-fg" : "text-fg-muted"}`}>{line}</p>
      ))}
    </div>
  );
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/billing/invoices/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then((d: Data | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token, id]);

  // A plain <a href> can't carry the Bearer token, so fetch the PDF and hand
  // the browser a blob to save.
  async function downloadPdf() {
    if (!data?.invoice) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/billing/invoices/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Clipiro-Invoice-${data.invoice.number.replace(/\//g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Couldn't download the invoice. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const inv = data?.invoice ?? null;
  const p = data?.purchase;
  const refunded = p?.status === "refunded";
  const intraState = inv ? inv.placeOfSupply === inv.sellerState : false;

  return (
    <div className="min-h-screen bg-surface py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link href="/dashboard?billing=1&tab=history" className="text-sm font-semibold text-ink-soft hover:text-ink inline-flex items-center gap-1.5">
            <IcBack /> Back to billing history
          </Link>
          {inv && (
            <Button onClick={downloadPdf} disabled={downloading}>
              <span className="inline-flex items-center gap-1.5"><IcDownload /> {downloading ? "Preparing…" : "Download invoice (PDF)"}</span>
            </Button>
          )}
        </div>
        {downloadError && <p role="alert" className="text-sm text-error mb-4">{downloadError}</p>}

        <div className="bg-panel rounded-[var(--radius-card)] border border-card-border p-6 sm:p-10">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-fg-subtle">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data || !p ? (
            <div className="text-center py-12">
              <p className="font-semibold text-fg">Receipt not found</p>
              <p className="text-sm text-fg-subtle mt-1">This purchase doesn&apos;t exist or isn&apos;t yours.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-6 border-b border-line">
                <span className="text-2xl font-extrabold text-brand tracking-tight">Clipiro</span>
                <div className="text-right">
                  <p className="text-lg font-bold text-fg">{inv ? "Tax Invoice" : "Payment Receipt"}</p>
                  {inv && <p className="text-xs text-fg-subtle">Original for Recipient</p>}
                </div>
              </div>

              {/* Amount hero */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-7 pb-5">
                <p className="text-2xl sm:text-3xl font-extrabold text-fg">
                  {money(inv?.total ?? p.amountInPaise, p.currency)} paid on {fmtDate(inv?.paidAt ?? p.createdAt)}
                </p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${refunded ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                  {refunded ? "REFUNDED" : "PAID"}
                </span>
              </div>

              {/* Meta */}
              <dl className="pb-7">
                {inv ? (
                  <>
                    <Row label="Invoice number" value={inv.number} mono />
                    <Row label="Invoice date" value={fmtDate(inv.issuedAt)} />
                    <Row label="Payment ID" value={`${inv.paymentRef} (Razorpay)`} mono />
                    <Row label="Place of supply" value={stateLabel(inv.placeOfSupply)} />
                    <Row label="Reverse charge" value="No" />
                  </>
                ) : (
                  <>
                    <Row label="Payment ID" value={p.id} mono />
                    <Row label="Item" value={p.plan?.name ?? "Credit Pack"} />
                    <Row label="Credits added" value={`+${p.credits.toLocaleString("en-IN")}`} />
                  </>
                )}
              </dl>

              {inv ? (
                <>
                  {/* From / Billed to */}
                  <div className="grid gap-6 sm:grid-cols-2 pb-7">
                    <Party title="From" lines={[inv.sellerName, ...addressLines(inv.sellerAddress), `GSTIN ${inv.sellerGstin}`]} />
                    <Party
                      title="Billed to"
                      lines={[
                        inv.buyerName,
                        inv.buyerAddress ?? "",
                        [stateLabel(inv.buyerState), inv.buyerPincode].filter(Boolean).join(" – "),
                        inv.buyerGstin ? `GSTIN ${inv.buyerGstin}` : "",
                        inv.buyerEmail,
                      ].filter(Boolean)}
                    />
                  </div>

                  {/* Line item */}
                  <div className="flex items-start justify-between gap-4 py-5 border-y border-line">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{inv.description}</p>
                      <p className="text-xs text-fg-subtle mt-1">SAC {inv.sac} · Qty 1 · Taxable value</p>
                    </div>
                    <p className="text-sm font-semibold text-fg whitespace-nowrap">{money(inv.taxable)}</p>
                  </div>

                  {/* Tax summary */}
                  <dl className="ml-auto sm:w-72 pt-5 space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-fg-muted">Taxable value</dt><dd className="text-fg">{money(inv.taxable)}</dd></div>
                    {intraState ? (
                      <>
                        <div className="flex justify-between"><dt className="text-fg-muted">CGST 9%</dt><dd className="text-fg">{money(inv.cgst)}</dd></div>
                        <div className="flex justify-between"><dt className="text-fg-muted">SGST 9%</dt><dd className="text-fg">{money(inv.sgst)}</dd></div>
                      </>
                    ) : (
                      <div className="flex justify-between"><dt className="text-fg-muted">IGST 18%</dt><dd className="text-fg">{money(inv.igst)}</dd></div>
                    )}
                    <div className="flex justify-between pt-3 border-t border-line text-base font-bold">
                      <dt className="text-fg">Total (incl. GST)</dt><dd className="text-fg">{money(inv.total)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs italic text-fg-subtle pt-5">{amountInWords(inv.total)}</p>

                  <div className="mt-8 pt-5 border-t border-line text-xs text-fg-subtle space-y-1">
                    <p>This is a computer-generated invoice and does not require a signature. Tax is not payable on reverse charge basis.</p>
                    <p>
                      Need your business name or GSTIN on future invoices?{" "}
                      <Link href="/dashboard/settings/profile#billing-details" className="text-brand hover:underline">Add billing details</Link>
                    </p>
                  </div>
                </>
              ) : (
                <div className="pt-5 border-t border-line space-y-3">
                  <p className="text-xs text-fg-subtle">Billed to {user?.name || user?.email || "—"}{user?.name ? ` · ${user.email}` : ""}</p>
                  {data.ineligible && <p className="text-sm text-fg-muted">{NO_INVOICE_REASON[data.ineligible]}</p>}
                  <p className="text-xs text-fg-subtle">Thank you for your purchase · Payments secured by Razorpay</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
