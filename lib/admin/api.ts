// Admin-specific layer over the shared request-handling core in
// lib/api-handler.ts: adds the admin-role + step-up-elevation gate on top of
// the same zod-validation/error-mapping every route gets via that module's
// withApi(). parseQuery/parseBody are re-exported unchanged so the existing
// admin routes importing them from here don't need to change.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type TokenPayload } from "@/lib/auth";
import { mapHandlerError } from "@/lib/api-handler";
import { getClientIp } from "@/lib/rate-limit";
import { runWithAdminContext } from "@/lib/admin/request-context";
import { auditAdminAction, auditOnce } from "@/lib/admin/audit";

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
    const context = {
      adminId: admin.userId,
      adminEmail: admin.email,
      sessionId: admin.sessionId,
      ip: (() => { const ip = getClientIp(req); return ip === "unknown" ? null : ip; })(),
      userAgent: req.headers.get("user-agent"),
    };
    const { isElevated } = await import("@/lib/admin/elevation");
    if (!(await isElevated(admin.userId, admin.sessionId))) {
      // An admin session hitting admin APIs without having passed the emailed
      // code — normal once per sign-in, suspicious in bulk. Recorded at most
      // once per session per 10 minutes so the log shows it without flooding.
      if (await auditOnce(`audit:elevation-required:${admin.sessionId}`, 600)) {
        await runWithAdminContext(context, () =>
          auditAdminAction(admin.userId, "admin.elevation_required", undefined, { after: { path: req.nextUrl.pathname } }),
        );
      }
      return NextResponse.json(
        { error: "Admin verification required", code: "elevation_required" },
        { status: 403 },
      );
    }
    return runWithAdminContext(context, async () => {
      try {
        const params = ctx?.params ? await ctx.params : ({} as P);
        return await handler(req, { admin, params });
      } catch (err) {
        return mapHandlerError("admin-api", req, err);
      }
    });
  };
}
