import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { loadPurchaseInvoice } from "@/lib/invoice/access";
import { invoiceFilename, renderInvoicePdf } from "@/lib/invoice/pdf";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/billing/invoices/[purchaseId]/pdf — the customer's GST tax invoice.
// Rendered on demand from the immutable Invoice snapshot, so a re-download
// shows exactly the figures that were emailed.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await loadPurchaseInvoice(id, auth.userId);
  if (!result?.invoice) return NextResponse.json({ error: "No invoice for this purchase" }, { status: 404 });

  const pdf = await renderInvoicePdf(result.invoice, { refunded: result.purchase.status === "refunded" });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFilename(result.invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withRateLimit(handleGET, { limit: 30, windowSec: 60, keyBy: "user", name: "billing:invoice-pdf" });
