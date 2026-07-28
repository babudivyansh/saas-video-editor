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
  // Second-factor and reactivation steps. Both are reached *after* the
  // password check but *before* any session exists, so this gate — which only
  // knows how to check the session cookie — can only ever 401 them. Each
  // authenticates by a server-minted, single-use Redis ticket that already
  // proves the password step happened (see lib/login-tail.ts's
  // mintTwoFactorTicket). Both routes carry an "intentionally
  // unauthenticated" comment that was silently overruled here: with them
  // missing, enabling 2FA locked the account out entirely.
  "/api/auth/2fa/verify-login",
  "/api/account/reactivate",
  "/api/webhooks/razorpay",
  "/api/health",
  "/api/cron/",
  "/api/plans",
  "/api/tool-costs",
  "/api/coupons/active",
  // Public review browsing — the /reviews marketing page's client-side
  // sort/filter/search reads GET /api/reviews for logged-out visitors too.
  // isPublicApiRoute matches by prefix, so this also un-gates
  // /api/reviews/me and /api/reviews/[id]/** at this layer — each of those
  // routes still self-enforces real auth via getAuthUser where it applies
  // (e.g. /api/reviews/me), so this only skips proxy's early-rejection
  // optimization for them, not the actual security boundary.
  "/api/reviews",
  // Live referral-code check on the registration form, reachable pre-account.
  // Does its own IP rate limiting (GROUP_LIMITS never applies to public routes).
  "/api/affiliate/validate-code",
  // Anonymous-capable tools (createJobStatusHandler's allowAnonymous: true) —
  // each route does its own IP-based rate limiting and charges no credits,
  // so letting logged-out requests through here is safe. Without this, every
  // request from a logged-out visitor died at this gate with a blanket 401
  // before ever reaching the route, silently breaking the "free tool" pitch.
  "/api/tools/audio-balancer",
  "/api/tools/mp3-converter",
  "/api/tools/video-compressor",
  // Same gap, different shape: each of these three has its own "no auth
  // required" code comment and does its own IP rate limiting, but none were
  // ever added here — every logged-out request still died at this gate with
  // a blanket 401 before reaching the route's own (deliberately permissive)
  // logic. enhance-prompt/voice-preview back the Image Generator and
  // Voiceover Generator tool pages; voices is the (previously-unused)
  // cached-preview-URL endpoint those same pickers now call.
  "/api/tools/enhance-prompt",
  "/api/tools/voice-preview",
  "/api/tools/voices",
  // Public developer API — authenticates by API key (lib/auth.ts's
  // getApiKeyAuth), a completely different mechanism from the session
  // cookie this gate exists to check. Each /api/v1/** route does its own
  // key validation and returns 401 itself for a missing/invalid key.
  "/api/v1/",
];

export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}
