import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "./rate-limit";
import { getAuthUser } from "./auth";

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
