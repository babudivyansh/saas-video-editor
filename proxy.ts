import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/auth";
import { isPublicApiRoute } from "@/lib/api-public-routes";
import { rateLimit } from "@/lib/rate-limit";

// Group-level rate limits for route families where abuse-resistance matters
// more than per-route cost tuning (unlike generate/*, tools/*, which use
// lib/with-rate-limit.ts per-route since their cost varies by AI provider
// call). Applied here, not per-file, so no admin/social/billing route can be
// missed as new ones are added.
const GROUP_LIMITS: { prefix: string; name: string; limit: number; windowSec: number }[] = [
  { prefix: "/api/admin/", name: "admin", limit: 60, windowSec: 60 },
  { prefix: "/api/social/", name: "social", limit: 60, windowSec: 60 },
  { prefix: "/api/billing/", name: "billing", limit: 30, windowSec: 60 },
];

/**
 * Single proxy.ts (only one is supported per project) covering two
 * unrelated concerns, branched on pathname:
 *  - /api/*: an optimistic auth gate — signature+expiry check only, no
 *    Postgres lookup, so it stays cheap on every request. This is a
 *    safety net, not a replacement for requireAdmin/requireSubscriber's
 *    authoritative per-route DB checks. Also applies group-level rate
 *    limits for admin/social/billing (see GROUP_LIMITS above).
 *  - everything else: first-click affiliate attribution cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }

    const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let userId: string;
    try {
      userId = verifyToken(session).userId;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const group = GROUP_LIMITS.find((g) => pathname.startsWith(g.prefix));
    if (group) {
      const result = await rateLimit(`${group.name}:user:${userId}`, group.limit, group.windowSec);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": String(group.windowSec) } },
        );
      }
    }

    return NextResponse.next();
  }

  const response = NextResponse.next();
  const ref = new URL(request.url).searchParams.get("ref");

  // Set affiliate cookie on first click only (don't overwrite existing attribution)
  if (ref && !request.cookies.get("affiliate_ref")) {
    response.cookies.set("affiliate_ref", ref, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
