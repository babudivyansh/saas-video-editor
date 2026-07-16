import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "./rate-limit";
import { getAuthUser } from "./auth";

// Convention, not an enforced default: every new route that accepts POST/PUT/
// PATCH/DELETE (or a GET that's expensive/scrapeable) should wrap its handler
// in withRateLimit before merging — nothing currently catches a route that
// forgets to. A custom lint rule or a shared route-wrapper requiring this
// would need to allowlist the many routes that are legitimately exempt
// (webhook routes verifying their own signature, admin routes already gated
// by withAdmin, simple reads) to avoid drowning code review in false
// positives — a bigger, separate task. Until then, this is a code-review
// checklist item, not an automated one.

export interface WithRateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  windowSec: number;
  /** "user" falls back to per-IP keying when there's no session (route still reachable unauthenticated). */
  keyBy: "user" | "ip";
  /** Distinguishes this route's bucket from others sharing a keyBy — pass the route name. */
  name: string;
}

type RouteHandler = (req: NextRequest) => Promise<Response>;

export function withRateLimit(handler: RouteHandler, opts: WithRateLimitOptions): RouteHandler {
  return async (req: NextRequest) => {
    let key: string;
    if (opts.keyBy === "user") {
      const auth = await getAuthUser(req);
      key = auth ? `${opts.name}:user:${auth.userId}` : `${opts.name}:ip:${getClientIp(req)}`;
    } else {
      key = `${opts.name}:ip:${getClientIp(req)}`;
    }

    const result = await rateLimit(key, opts.limit, opts.windowSec);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(opts.windowSec) } },
      );
    }

    return handler(req);
  };
}
