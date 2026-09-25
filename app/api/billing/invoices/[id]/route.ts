import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { loadPurchaseInvoice } from "@/lib/invoice/access";

// GET /api/billing/invoices/[purchaseId] — the receipt page's data: the
// purchase plus its GST tax invoice (issued on first view if fulfilment's
// attempt failed), or the reason it has none (USD, pre-GST, refunded).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Owner-scoped: someone else's purchase id is a 404, never a 403.
  const result = await loadPurchaseInvoice(id, auth.userId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
