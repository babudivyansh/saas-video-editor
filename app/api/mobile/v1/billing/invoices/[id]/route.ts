import type { NextRequest } from "next/server";
import { getInvoice } from "@/lib/mobile/billing";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/billing/invoices/:id → { invoice, fileName }: one of the caller's purchases.
export const GET = withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
  const found = await getInvoice(auth.userId, (await params).id);
  return found ? mobileJson(found) : mobileError(404, "That purchase isn’t on your account.", { code: "not_found" });
});
