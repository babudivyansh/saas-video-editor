// The admin console's own subdomain (ADMIN_ORIGIN, e.g. https://admin.clipiro.com).
//
// Same Next.js app, routed by Host in proxy.ts. The session cookie is
// host-only, so the admin host keeps its own sign-in, separate from the main
// site's: a customer-side session can't drive the admin API, because
// /api/admin/* only answers on this host. Unset (local dev, or before the
// subdomain is wired up), nothing here changes routing at all.

import type { NextRequest } from "next/server";

/** Sign-in pages the admin host serves itself; everything else non-admin goes back to the main site. */
const ADMIN_HOST_AUTH_PAGES = ["/login", "/reset-password-request", "/reset-password", "/verify-email"];

export function adminOrigin(): URL | null {
  const raw = process.env.ADMIN_ORIGIN;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** The host the browser asked for. Host (not nextUrl) — same source as lib/auth.ts's same-origin check. */
export function requestHost(req: NextRequest): string {
  return (req.headers.get("host") ?? req.nextUrl.host).toLowerCase();
}

/** True when ADMIN_ORIGIN is configured and this request came in on it. */
export function isAdminHostRequest(req: NextRequest): boolean {
  const admin = adminOrigin();
  return admin !== null && requestHost(req) === admin.host;
}

export function isAdminPagePath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isAdminApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/");
}

export function isAdminHostAuthPage(pathname: string): boolean {
  return ADMIN_HOST_AUTH_PAGES.includes(pathname);
}

/** Public files (robots.txt, fonts, images) — served on either host. */
export function isStaticFilePath(pathname: string): boolean {
  return /\/[^/]+\.[a-z0-9]+$/i.test(pathname);
}
