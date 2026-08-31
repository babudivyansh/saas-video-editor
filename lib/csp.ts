// Content-Security-Policy — enumerated from actual third-party origins the
// frontend loads/connects to (grepped, not guessed): Razorpay checkout
// script + its API/iframe, Sentry's error-ingest endpoint (host varies with
// NEXT_PUBLIC_SENTRY_DSN, hence the wildcard), S3 for uploaded video/image
// assets, and Google's avatar CDN (Google OAuth itself is a full-page
// redirect, not a CSP-governed fetch — no origin needed for it).
//
// Built per-request (see proxy.ts) rather than as static next.config.ts
// headers, so a per-request nonce can be included in script-src — the
// prerequisite for ever dropping 'unsafe-inline' there. Still Report-Only:
// watch app/api/csp-report's logged violations (and Sentry) for a clean
// window before flipping to an enforcing header. 'unsafe-inline'/'unsafe-eval'
// stay for now even with a nonce present — conforming browsers use the nonce
// and ignore unsafe-inline in the same directive, so this doesn't weaken the
// policy for them; it just avoids breaking anything that still needs the
// fallback during the migration window.
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.amazonaws.com https://lh3.googleusercontent.com",
    "media-src 'self' https://*.amazonaws.com",
    "connect-src 'self' https://api.razorpay.com https://*.razorpay.com https://*.sentry.io https://*.ingest.sentry.io",
    "frame-src 'self' https://api.razorpay.com https://*.razorpay.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}
