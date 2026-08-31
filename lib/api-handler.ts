// Shared request-handling core: one error shape, usable by any route.
//
// Extracted from lib/admin/api.ts's withAdmin, which had this exact
// zod-validation + error-mapping logic but bundled it with the admin-role
// gate — none of the mapping itself (ZodError -> 400 w/ issues, malformed
// JSON -> 400, known Prisma errors -> 404/409, fallback -> logged 500) is
// admin-specific. withAdmin now delegates here; withApi below is the same
// core with plain session auth instead of the admin/elevation gate, for the
// many non-admin routes that still hand-roll `typeof x === "string"` checks
// and their own ad hoc try/catch instead of a schema.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { getAuthUser, type TokenPayload } from "@/lib/auth";
import { logger } from "@/lib/logger";

export function mapHandlerError(tag: string, req: NextRequest, err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err.code === "P2002") return NextResponse.json({ error: "Conflict: duplicate value" }, { status: 409 });
    if (err.code === "P2003") return NextResponse.json({ error: "Conflict: referenced by other records" }, { status: 409 });
  }
  logger.error(tag, `${req.method} ${new URL(req.url).pathname} failed`, err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// Zod over query params. Throws ZodError -> the wrapper's 400.
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

// Zod over the JSON body. Malformed JSON throws SyntaxError -> the wrapper's 400.
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json());
}

type ApiHandler<P> = (
  req: NextRequest,
  ctx: { auth: TokenPayload; params: P },
) => Promise<NextResponse> | NextResponse;

/**
 * Standard authenticated-route wrapper: session auth (401 if missing), then
 * the same parseBody/parseQuery + error-mapping withAdmin gives admin
 * routes. Handlers validate with zod and just THROW — this turns failures
 * into consistent JSON instead of each route hand-rolling its own checks
 * and try/catch.
 */
export function withApi<P = Record<string, never>>(handler: ApiHandler<P>) {
  return async (req: NextRequest, ctx?: { params: Promise<P> }): Promise<NextResponse> => {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await handler(req, { auth, params });
    } catch (err) {
      return mapHandlerError("api", req, err);
    }
  };
}
