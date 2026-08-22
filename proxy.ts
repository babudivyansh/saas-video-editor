import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/auth";
import { publicPathForAppPath } from "@/app/components/featureLinks";
import { withNextParam } from "@/lib/safe-redirect";
import { isPublicApiRoute } from "@/lib/api-public-routes";
import { ATTRIBUTION_COOKIE, buildAttributionCookie } from "@/lib/marketing-attribution";
import { rateLimit } from "@/lib/rate-limit";
import { buildCsp } from "@/lib/csp";

// Sets the same per-request CSP (see lib/csp.ts) on every response this file
// returns, so removing the static header from next.config.ts (which can't
// vary per request) doesn't drop CSP coverage from any path — API responses
// included, even though only page responses actually consume the nonce via
// JsonLd's headers() read.
function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy-Report-Only", csp);
  return response;
}

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
// /billing is no longer a route — it redirects to /dashboard?billing=1, which
// this list already covers. redirects() runs before the proxy, so a signed-out
// hit on /billing lands on /dashboard and is bounced to /login from there.
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/editor"];
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
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return withCsp(NextResponse.next(), csp);
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
          return withCsp(NextResponse.json(
            { error: maint.message || "Clipiro is briefly down for maintenance — back shortly.", maintenance: true },
            { status: 503, headers: { "Retry-After": "300" } },
          ), csp);
        }
      }
    }

    const auth = getOptimisticAuth(request);
    if (!auth) {
      return withCsp(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), csp);
    }

    const group = GROUP_LIMITS.find((g) => pathname.startsWith(g.prefix));
    if (group) {
      const result = await rateLimit(`${group.name}:user:${auth.userId}`, group.limit, group.windowSec);
      if (!result.allowed) {
        return withCsp(NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": String(group.windowSec) } },
        ), csp);
      }
    }

    return withCsp(NextResponse.next(), csp);
  }

  const auth = getOptimisticAuth(request);

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtectedPage && !auth) {
    const originalDestination = pathname + request.nextUrl.search;
    // A bare tool path (no query string) is ambiguous browsing — send them to
    // that tool's public marketing page rather than a bare login form: they
    // clicked "AI Voiceover" wanting to know what it is, and the marketing
    // page answers that and then offers the sign-up. But a query string (e.g.
    // ?projectId=... on the editor) signals genuine intent to reach a specific
    // resource, not idle browsing — skip the marketing detour and preserve the
    // exact destination through /login?next= instead, since the tool page's
    // own sign-in CTA has no way to carry that state onward.
    const publicPage = request.nextUrl.search ? undefined : publicPathForAppPath(pathname);
    const target = publicPage ?? withNextParam("/login", originalDestination);
    return withCsp(NextResponse.redirect(new URL(target, request.url)), csp);
  }

  const isSignedOutOnlyPage = SIGNED_OUT_ONLY_PATHS.includes(pathname);
  if (isSignedOutOnlyPage && auth) {
    return withCsp(NextResponse.redirect(new URL("/dashboard", request.url)), csp);
  }

  // Page responses additionally get the nonce threaded through as a request
  // header — this is what JsonLd's headers() read picks up server-side, via
  // Next's documented middleware pattern for per-request CSP nonces.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref");

  // Set affiliate cookie on first click only (don't overwrite existing
  // attribution), unless the visitor explicitly opted out of marketing
  // cookies on /cookies (app/cookies/CookiePreferences.tsx). Absence of the
  // consent cookie — everyone who never visits that page — defaults to
  // allowed, matching today's behavior for the overwhelming majority.
  const marketingConsent = request.cookies.get("cookie_consent_marketing")?.value;
  if (ref && marketingConsent !== "denied" && !request.cookies.get("affiliate_ref")) {
    response.cookies.set("affiliate_ref", ref, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      path: "/",
    });
  }

  // Campaign attribution, on exactly the same terms as affiliate_ref above:
  // first touch wins, 30 days, httpOnly, and skipped entirely when marketing
  // consent is denied.
  //
  // One cookie holding all three values rather than three separate cookies —
  // three can expire or be cleared independently and leave a half-attributed
  // signup, whereas one is atomic. Consumed and cleared at registration; see
  // lib/marketing-attribution.ts.
  if (marketingConsent !== "denied" && !request.cookies.get(ATTRIBUTION_COOKIE)) {
    const attribution = buildAttributionCookie(
      params.get("utm_source"),
      params.get("utm_medium"),
      params.get("utm_campaign"),
    );
    if (attribution) {
      response.cookies.set(ATTRIBUTION_COOKIE, attribution, {
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
