import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getSafeNextPath, withNextParam } from "@/lib/safe-redirect";

// Drops a session cookie whose server-side session record no longer exists,
// then sends the visitor to /login.
//
// A Server Component cannot clear a cookie — only a Route Handler or a Server
// Action can — so a page that discovers a dead session has to bounce through
// here rather than redirecting to /login itself. Redirecting straight to
// /login would also achieve nothing: the cookie's JWT is still signed and
// unexpired, so proxy.ts's SIGNED_OUT_ONLY_PATHS rule would immediately bounce
// it back to /dashboard, still holding the same dead session. Clearing the
// cookie first is what makes /login actually reachable.
//
// GET, not POST like /api/auth/logout, because this is reached by a redirect
// from a page render, not by a fetch. It is safe as a GET: it destroys only
// the caller's own cookie, and the session it names is already gone — there is
// nothing here for a cross-site request to accomplish beyond signing someone
// out of a session that no longer works.
export async function GET(req: NextRequest) {
  // Validated, never echoed raw: an unchecked ?next would make this an open
  // redirect reachable without a session.
  const next = getSafeNextPath(req.nextUrl.searchParams.get("next"));
  const target = withNextParam("/login", next);
  const res = NextResponse.redirect(new URL(target, req.url));
  clearSessionCookie(res);
  return res;
}
