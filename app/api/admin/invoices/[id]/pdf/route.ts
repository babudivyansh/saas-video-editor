import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { loadPurchaseInvoice } from "@/lib/invoice/access";
import { invoiceFilename, renderInvoicePdf } from "@/lib/invoice/pdf";

// GET /api/admin/invoices/[purchaseId]/pdf — support can pull any customer's
// GST tax invoice (e.g. to resend it, or for the CA at filing time). Issues it
// lazily, exactly like the customer path.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  const result = await loadPurchaseInvoice(params.id, null);
  if (!result) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  if (!result.invoice) {
    return NextResponse.json({ error: "No invoice for this purchase", reason: result.ineligible }, { status: 404 });
  }

  const pdf = await renderInvoicePdf(result.invoice, { refunded: result.purchase.status === "refunded" });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFilename(result.invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
