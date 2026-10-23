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
  // Prefix: also un-gates register/verify and register/resend, the two
  // steps of the emailed-code signup (no account or session exists yet).
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-otp",
  "/api/auth/send-otp",
  "/api/auth/google",
  "/api/auth/callback/google",
  // Clears a session cookie whose server-side record is already gone, then
  // redirects to /login. Ungated deliberately: the whole point is that the
  // session behind the cookie no longer resolves, and the JWT can expire in
  // the window between the page redirecting here and the browser following —
  // gating it would answer that with a JSON 401 in the address bar instead of
  // the login form. Nothing here reads a session or touches another user: it
  // only expires the caller's own cookie. Written out in full rather than as
  // an "/api/auth/session" prefix, which would also un-gate the real
  // /api/auth/sessions device-management routes.
  "/api/auth/session-expired",
  // Finishes an email change from the link sent to the NEW address — opened
  // from a mail client, often on a device with no session at all. The route
  // was always documented "intentionally unauthenticated" but was never
  // listed here, so this gate 401'd every signed-out click. The token in the
  // body is the credential.
  "/api/auth/change-email/confirm",
  // Second-factor and reactivation steps. Both are reached *after* the
  // password check but *before* any session exists, so this gate — which only
  // knows how to check the session cookie — can only ever 401 them. Each
  // authenticates by a server-minted, single-use Redis ticket that already
  // proves the password step happened (see lib/login-tail.ts's
  // mintTwoFactorTicket). Both routes carry an "intentionally
  // unauthenticated" comment that was silently overruled here: with them
  // missing, enabling 2FA locked the account out entirely.
  "/api/auth/2fa/verify-login",
  // The Android app's sign-in steps (login, signup, OTP, 2FA, Google,
  // refresh, forgot password, reactivate) — the same pre-session steps as the
  // web routes above, which they wrap. logout authenticates itself (refresh
  // token or Bearer) and always answers ok.
  "/api/mobile/v1/auth/",
  "/api/account/reactivate",
  // The Social Tracker's OAuth return from Google / Meta. It identifies the
  // person only by the signed, single-use `state` plus the PKCE verifier it
  // minted at connect time (lib/social/oauth.ts) — never by a session; its own
  // comment says so. On the web the browser happened to carry the cookie, so
  // nothing failed; a connect started in the phone app (mobile Phase 11.2)
  // returns through a Custom Tab with no clipiro.com cookie at all, which this
  // gate 401'd before the handler could read the state.
  "/api/social/callback/",
  "/api/webhooks/razorpay",
  // Resend's bounce/complaint feedback. Authenticated by its Svix signature,
  // not by a session — Resend has no account here. Without this entry proxy.ts
  // 401s it before the handler runs, so hard bounces are never recorded and
  // dead addresses keep getting mailed, which is the exact failure the webhook
  // exists to prevent.
  "/api/webhooks/resend",
  // Caption-render completion callbacks. Authenticated by an unguessable token
  // in the path (SUBMAGIC_WEBHOOK_TOKEN) plus, when configured, an HMAC
  // signature — the provider has no session here, so this gate could only ever
  // 401 it. Matching is by prefix, which is what un-gates the /[token] segment.
  //
  "/api/webhooks/submagic",
  // ElevenLabs dubbing completion. Authenticated by its HMAC signature and
  // fails closed while ELEVENLABS_WEBHOOK_SECRET is unset; until it was listed
  // here every callback 401'd at this gate and dubs finished only through the
  // dub sweep.
  "/api/webhooks/elevenlabs",
  // Per-category unsubscribe. Must work from a mail client, where there is by
  // definition no session — the signed token IS the authorisation. This also
  // has to stay reachable for the RFC 8058 one-click POST that Gmail and Yahoo
  // require, which they send with no credentials at all.
  "/api/email/unsubscribe",
  "/api/health",
  "/api/cron/",
  // The per-minute scheduler that calls the /api/cron/* routes on hosts with
  // no cron (app/api/cron-tick). Same bearer-secret protection as they have.
  "/api/cron-tick",
  "/api/plans",
  "/api/tool-costs",
  // Admin price overrides for the image/video models — the generator pages
  // show prices to logged-out visitors too, and it exposes nothing but prices.
  "/api/model-prices",
  "/api/coupons/active",
  // Public review browsing — the /reviews marketing page's client-side
  // sort/filter/search reads GET /api/reviews for logged-out visitors too.
  // isPublicApiRoute covers the paths below an entry, so this also un-gates
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
  // logic. voices is the cached-preview-URL endpoint the voice pickers call.
  // enhance-prompt used to be listed here too; it is a real Gemini call, so it
  // now requires sign-in like the image generation it feeds.
  // The voice catalogue. Public because the create pages render for
  // logged-out visitors and this carries nothing sensitive — names,
  // languages and the provider's own public preview URLs, with the id that
  // routes a paid call stripped server-side. What costs money is
  // SYNTHESIS, and /api/tools/voice-preview is deliberately NOT listed
  // here any more: it was real, billable TTS behind an IP-only limit,
  // which is a free TTS endpoint for anyone willing to rotate IPs.
  "/api/voices",
  // Anonymous first-party analytics beacon and the double opt-in newsletter
  // flow. Both are fired from public marketing pages (the blog) by visitors who
  // are logged out by definition — without these entries every one of those
  // requests dies here with a blanket 401, which is invisible in local dev
  // (you're logged in) and in CI (no e2e covers a logged-out beacon).
  // Each route does its own IP rate limiting; none reads a session.
  "/api/marketing/",
  "/api/newsletter/",
  // Public contact form — reachable by logged-out visitors by definition.
  // Does its own IP rate limiting.
  "/api/contact",
  // Browser-sent Content-Security-Policy violation reports (report-uri
  // directive in lib/csp.ts) — fired by any visitor's browser, logged-in or
  // not, so there is by definition no session to check. IP rate-limited by
  // the route itself.
  "/api/csp-report",
  // Public developer API — authenticates by API key (lib/auth.ts's
  // getApiKeyAuth), a completely different mechanism from the session
  // cookie this gate exists to check. Each /api/v1/** route does its own
  // key validation and returns 401 itself for a missing/invalid key.
  "/api/v1/",
];

// An entry matches itself and the paths below it ("/api/auth/register" covers
// "/api/auth/register/verify"), never a sibling that merely shares the
// letters: "/api/auth/login" must not un-gate "/api/auth/login-history".
// Entries ending in "/" cover only what is below them.
export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
