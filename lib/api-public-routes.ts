/**
 * API paths that proxy.ts must not gate behind the session cookie: they
 * either issue the session in the first place, or authenticate by a
 * different mechanism entirely (HMAC signature, cron secret).
 *
 * Separate from AuthContext.tsx's PUBLIC_ROUTES, which governs frontend
 * page redirects, not API access — do not merge the two lists.
 */
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-otp",
  "/api/auth/send-otp",
  "/api/auth/google",
  "/api/auth/callback/google",
  "/api/webhooks/razorpay",
  "/api/health",
  "/api/cron/",
];

export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}
