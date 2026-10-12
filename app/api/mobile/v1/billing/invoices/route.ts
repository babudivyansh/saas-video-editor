import type { NextRequest } from "next/server";
import { listInvoices } from "@/lib/mobile/billing";
import { mobileJson, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/billing/invoices → { invoices }: purchases made on the web, newest first.
export const GET = withMobileAuth(async (_req: NextRequest, auth) => mobileJson({ invoices: await listInvoices(auth.userId) }));
