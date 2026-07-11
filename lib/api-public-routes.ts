/**
 * API paths that proxy.ts must not gate behind the session cookie: they
 * either issue the session in the first place, authenticate by a different
 * mechanism entirely (HMAC signature, cron secret), or are read-only public
 * marketing data with no per-user information (plans/pricing/active coupons)
 * that the public /pricing page must be able to load for logged-out visitors.
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
  "/api/plans",
  "/api/tool-costs",
  "/api/coupons/active",
];

export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}
