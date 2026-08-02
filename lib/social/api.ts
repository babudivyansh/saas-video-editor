// Shared plumbing for every /api/social route: one auth gate, one tenancy check,
// one error shape.
//
// Mirrors the proven lib/admin/api.ts. Handlers validate with zod and just THROW
// — this wrapper maps failures to consistent JSON.
//
// SECURITY. assertOwnedAccount is the only thing standing between tenants: there
// is no Postgres RLS, and the ownership filter used to be a `findFirst` copied
// into seven route files. It lives here now so there is exactly one
// implementation to review and one to test. Every route touching an accountId
// must go through it, and must carry a cross-tenant test case.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";
import { ZodError, type ZodType } from "zod";
import { getAuthUser, requireSubscriber, type TokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ProviderApiError } from "./errors";

/** Message shown when a non-subscriber hits a gated route. */
const UPSELL = "Social Tracker is available on paid plans.";

/** Thrown by assertOwnedAccount. Mapped to 404 — never 403, which would confirm
 *  that the id exists and belongs to someone else. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown by a handler that wants a specific 4xx without reaching for NextResponse. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface SocialContext<P> {
  auth: TokenPayload;
  params: P;
}

export interface WithSocialOptions<P> {
  /**
   * Require an active subscription (402 when absent). Default true.
   * Set false for routes a lapsed user must still reach — notably DELETE, so
   * people can always remove their own data.
   */
  subscriber?: boolean;
  rateLimit?: {
    key: (auth: TokenPayload, params: P) => string;
    max: number;
    windowSec: number;
  };
}

type SocialHandler<P> = (
  req: NextRequest,
  ctx: SocialContext<P>,
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap a route handler.
 *
 * Note the returned signature: in Next 16 `params` arrives as a Promise and the
 * sync compatibility shim is gone. The wrapper awaits it once so handlers see
 * plain values.
 */
export function withSocial<P = Record<string, never>>(
  handler: SocialHandler<P>,
  opts: WithSocialOptions<P> = {},
) {
  const requireSub = opts.subscriber !== false;

  return async (req: NextRequest, ctx?: { params: Promise<P> }): Promise<NextResponse> => {
    const auth = requireSub ? await requireSubscriber(req) : await getAuthUser(req);
    if (!auth) {
      return requireSub
        ? NextResponse.json({ error: UPSELL, code: "subscription_required" }, { status: 402 })
        : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let params: P;
    try {
      params = ctx?.params ? await ctx.params : ({} as P);
    } catch {
      return NextResponse.json({ error: "Invalid route parameters" }, { status: 400 });
    }

    if (opts.rateLimit) {
      const { key, max, windowSec } = opts.rateLimit;
      const { allowed } = await rateLimit(key(auth, params), max, windowSec);
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many requests. Try again shortly.", code: "rate_limited" },
          { status: 429, headers: { "Retry-After": String(windowSec) } },
        );
      }
    }

    try {
      return await handler(req, { auth, params });
    } catch (err) {
      return toErrorResponse(err, req);
    }
  };
}

function toErrorResponse(err: unknown, req: NextRequest): NextResponse {
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
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
  if (err instanceof ProviderApiError) {
    // The platform failed, not us. 502 so clients can distinguish and retry.
    logger.warn("social-api", `provider error ${err.status}`, { status: err.status });
    return NextResponse.json(
      { error: "The social platform rejected the request. Try again shortly.", code: "provider_error" },
      { status: 502 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Already exists", code: "duplicate" }, { status: 409 });
    }
  }

  const path = new URL(req.url).pathname;
  logger.error("social-api", `${req.method} ${path} failed`, err);
  Sentry.captureException(err, { tags: { area: "social-api", path, method: req.method } });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Load an account, asserting it belongs to `userId`.
 *
 * Throws NotFoundError (→ 404) when the account does not exist OR belongs to
 * someone else. The two cases are deliberately indistinguishable: a 403 would
 * confirm the id is real, which is an enumeration oracle.
 */
export async function assertOwnedAccount(userId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) throw new NotFoundError("Account not found");
  return account;
}

/** Ownership check for several accounts at once. All must belong to the user. */
export async function assertOwnedAccounts(userId: string, accountIds: string[]) {
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, userId },
  });
  if (accounts.length !== accountIds.length) throw new NotFoundError("Account not found");
  return accounts;
}

/** zod over query params. Throws ZodError → the wrapper's 400. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

/** zod over the JSON body. Malformed JSON throws SyntaxError → the wrapper's 400. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json());
}

/** Success envelope for new routes. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}
