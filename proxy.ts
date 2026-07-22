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
  { prefix: "/api/affiliate/", name: "affiliate", limit: 30, windowSec: 60 },
];

// Auth-gated app surfaces: unauthenticated visitors get bounced to /login
// before the page ever renders, instead of relying on each page's own
// client-side check (previously inconsistent — e.g. /dashboard had none at
// all, so a signed-out visitor just saw an empty shell).
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/billing", "/editor"];
// Signed-out-only entry points: once authenticated, redirect straight into
// the app instead of re-showing the landing/login/register screen.
const SIGNED_OUT_ONLY_PATHS = ["/", "/login", "/register"];

/**
 * Optimistic auth check — session cookie present + signature/expiry valid,
 * no Postgres/session-revocation lookup, so it stays cheap on every request.
 * Shared by both the /api and page-routing branches of proxy() below. This
 * is a safety net, not a replacement for requireAdmin/requireSubscriber's
 * (or getAuthUser's) authoritative per-route DB checks.
 */
function getOptimisticAuth(request: NextRequest): { userId: string } | null {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  try {
    return { userId: verifyToken(session).userId };
  } catch {
    return null;
  }
}

/**
 * Single proxy.ts (only one is supported per project) covering three
 * unrelated concerns, branched on pathname:
 *  - /api/*: the optimistic auth gate (see getOptimisticAuth) plus
 *    group-level rate limits for admin/social/billing (GROUP_LIMITS above).
 *  - protected pages (/dashboard, /billing): redirect to /login when the
 *    optimistic check fails.
 *  - signed-out-only pages (/, /login, /register): redirect to /dashboard
 *    when the optimistic check succeeds.
 *  - everything else: first-click affiliate attribution cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }

    // Maintenance mode: block non-admin API traffic with a clear 503. Admin
    // routes and /api/health stay reachable so it can be turned off and
    // monitored. Reads a 15s in-process cache over one Redis key — negligible
    // hot-path cost (lib/flags.ts). Admins bypass this block automatically.
    if (!pathname.startsWith("/api/admin/") && pathname !== "/api/health") {
      const { getMaintenanceModeCached } = await import("@/lib/flags");
      const maint = await getMaintenanceModeCached();
      if (maint.on) {
        let isAdmin = false;
        try {
          const { requireAdmin } = await import("@/lib/auth");
          const adminAuth = await requireAdmin(request);
          if (adminAuth) {
            isAdmin = true;
          }
        } catch {
          // Fail secure (non-admin) on database/Redis query error
        }

        if (!isAdmin) {
          return NextResponse.json(
            { error: maint.message || "Clipiro is briefly down for maintenance — back shortly.", maintenance: true },
            { status: 503, headers: { "Retry-After": "300" } },
          );
        }
      }
    }

    const auth = getOptimisticAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const group = GROUP_LIMITS.find((g) => pathname.startsWith(g.prefix));
    if (group) {
      const result = await rateLimit(`${group.name}:user:${auth.userId}`, group.limit, group.windowSec);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": String(group.windowSec) } },
        );
      }
    }

    return NextResponse.next();
  }

  const auth = getOptimisticAuth(request);

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtectedPage && !auth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isSignedOutOnlyPage = SIGNED_OUT_ONLY_PATHS.includes(pathname);
  if (isSignedOutOnlyPage && auth) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
