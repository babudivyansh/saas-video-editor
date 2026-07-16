// Shared plumbing for every /api/admin route: one admin gate, one error shape.
// Handlers validate with zod and just THROW — this wrapper turns failures into
// consistent JSON: ZodError → 400 {error, issues}, malformed body → 400,
// Prisma known errors → 404/409, anything else → logged 500.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { requireAdmin, type TokenPayload } from "@/lib/auth";
import { logger } from "@/lib/logger";

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
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (err.code === "P2002") return NextResponse.json({ error: "Conflict: duplicate value" }, { status: 409 });
        if (err.code === "P2003") {
          return NextResponse.json({ error: "Conflict: referenced by other records" }, { status: 409 });
        }
      }
      logger.error("admin-api", `${req.method} ${new URL(req.url).pathname} failed`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

// Zod over query params. Throws ZodError → the wrapper's 400.
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

// Zod over the JSON body. Malformed JSON throws SyntaxError → the wrapper's 400.
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json());
}
