// Content-Security-Policy — enumerated from actual third-party origins the
// frontend loads/connects to (grepped, not guessed): Razorpay checkout
// script + its API/iframe, Sentry's error-ingest endpoint (host varies with
// NEXT_PUBLIC_SENTRY_DSN, hence the wildcard), S3 (and the optional CDN in
// front of it, CDN_BASE_URL) for uploaded video/image assets — presigned
// uploads PUT straight to the bucket, and the editor fetches media from it —
// ElevenLabs' preview mp3s on storage.googleapis.com, and Google's avatar CDN
// (Google OAuth itself is a full-page redirect, not a CSP-governed fetch — no
// origin needed for it). blob: covers local previews (URL.createObjectURL)
// and synthesized voice previews.
//
// Enforced (proxy.ts sends Content-Security-Policy), with report-uri kept so
// violations still reach app/api/csp-report.
//
// script-src: no 'unsafe-eval' outside `next dev` — neither React nor Next
// uses eval in production (React needs it in development only, for its
// server error stacks), and nothing else here does: the editor, Sentry and
// Razorpay's checkout.js all run without it. Zod v4 probes for eval once (a
// caught Function("")), which instrumentation-client.ts turns off with
// z.config({ jitless: true }) so it doesn't file a report on every page.
// 'unsafe-inline' stays, and deliberately WITHOUT a nonce: a nonce makes CSP3 browsers ignore
// 'unsafe-inline', so every inline script Next emits on a statically
// prerendered page (which can never carry a per-request nonce) would be
// blocked and hydration would break. A nonce-only policy needs every page
// rendered dynamically first — see docs/security/csp-and-session-storage.md.
// proxy.ts still mints the nonce and passes it as x-nonce, which JsonLd puts
// on its script tag, so that switch is a one-line change here later.

/** The CDN in front of the asset bucket, as a CSP source, when one is configured. */
function cdnSource(): string | null {
  const raw = process.env.CDN_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function buildCsp(): string {
  const isDev = process.env.NODE_ENV === "development";
  const assets = ["https://*.amazonaws.com", cdnSource()].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    // checkout.js (checkout.razorpay.com) pulls more of Razorpay's scripts in,
    // e.g. its risk-detection bundle from cdn.razorpay.com.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://*.razorpay.com`,
    "style-src 'self' 'unsafe-inline'",
    // Stock thumbnails and hover previews load straight from the providers
    // (the hosts in lib/stock-hosts.ts) until the user adds one.
    `img-src 'self' data: blob: ${assets} https://lh3.googleusercontent.com https://images.pexels.com https://*.giphy.com`,
    `media-src 'self' blob: ${assets} https://storage.googleapis.com https://videos.pexels.com https://player.vimeo.com https://*.jamendo.com`,
    `connect-src 'self' blob: ${assets} https://api.razorpay.com https://*.razorpay.com https://*.sentry.io https://*.ingest.sentry.io`,
    "frame-src 'self' https://api.razorpay.com https://*.razorpay.com",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}
