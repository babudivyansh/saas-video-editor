import type { NextRequest } from "next/server";
import { GET as webPdf } from "@/app/api/billing/invoices/[id]/pdf/route";
import { withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/billing/invoices/:id/pdf → the invoice PDF: the web's own
// (owner check, rate limit, GST rendering). The Bearer token is the auth.
export const GET = withMobileAuth(async (req: NextRequest, _auth, ctx: Ctx) => webPdf(req, ctx));
