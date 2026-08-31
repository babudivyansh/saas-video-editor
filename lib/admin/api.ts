// Admin-specific layer over the shared request-handling core in
// lib/api-handler.ts: adds the admin-role + step-up-elevation gate on top of
// the same zod-validation/error-mapping every route gets via that module's
// withApi(). parseQuery/parseBody are re-exported unchanged so the existing
// admin routes importing them from here don't need to change.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type TokenPayload } from "@/lib/auth";
import { mapHandlerError } from "@/lib/api-handler";

export { parseQuery, parseBody } from "@/lib/api-handler";

type AdminHandler<P> = (
  req: NextRequest,
  ctx: { admin: TokenPayload; params: P },
) => Promise<NextResponse> | NextResponse;

export function withAdmin<P = Record<string, never>>(handler: AdminHandler<P>) {
  return async (req: NextRequest, ctx?: { params: Promise<P> }): Promise<NextResponse> => {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Step-up gate: a dashboard session alone is not enough for admin APIs —
    // the admin must have verified an email OTP recently (lib/admin/elevation).
    // The /api/admin/elevate route itself uses requireAdmin directly.
    const { isElevated } = await import("@/lib/admin/elevation");
    if (!(await isElevated(admin.userId))) {
      return NextResponse.json(
        { error: "Admin verification required", code: "elevation_required" },
        { status: 403 },
      );
    }
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await handler(req, { admin, params });
    } catch (err) {
      return mapHandlerError("admin-api", req, err);
    }
  };
}
