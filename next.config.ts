import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone", // Optimizes build size for Node.js shared hosting
  // Keep native packages out of the server bundle to prevent Turbopack build errors
  serverExternalPackages: ["ffmpeg-static", "@napi-rs/canvas"],
  turbopack: {
    // Pin the workspace root to this project. Without this, Next can infer the
    // wrong root if an ancestor directory (e.g. the home dir) contains a stray
    // lockfile, which misplaces Turbopack's on-disk cache and can break dev.
    root: __dirname,
  },
  experimental: {
    // proxy.ts runs an auth gate on every /api/* request, and this fork
    // buffers the request body (to let both proxy and the route handler read
    // it) up to this limit before silently truncating the rest — the default
    // 10MB was truncating /api/upload's multipart body for any video over
    // that size, which the route then rejects as an invalid/incomplete
    // upload. Match /api/upload's own 500MB cap (utils intentionally reject
    // anything larger there already) rather than raising this without bound.
    proxyClientMaxBodySize: "500mb",
  },
  images: {
    remotePatterns: [
      // Generated/uploaded video+image assets (bucket/region are configurable
      // via AWS_S3_BUCKET/AWS_REGION, hence the wildcard rather than one fixed host).
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
      // Google OAuth profile avatar images.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Content-Security-Policy is Report-Only for now — enumerated from actual
  // third-party origins the frontend loads/connects to (grepped, not guessed):
  // Razorpay checkout script + its API/iframe, Sentry's error-ingest endpoint
  // (host varies with NEXT_PUBLIC_SENTRY_DSN, hence the wildcard), S3 for
  // uploaded video/image assets, and Google's avatar CDN (Google OAuth itself
  // is a full-page redirect, not a CSP-governed fetch — no origin needed for it).
  // Watch Sentry/browser console for violations in staging before flipping
  // this to an enforcing Content-Security-Policy header.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.amazonaws.com https://lh3.googleusercontent.com",
      "media-src 'self' https://*.amazonaws.com",
      "connect-src 'self' https://api.razorpay.com https://*.razorpay.com https://*.sentry.io https://*.ingest.sentry.io",
      "frame-src 'self' https://api.razorpay.com https://*.razorpay.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  // Subscription/Credits/Payment-History were consolidated into the single
  // tabbed /billing page (see app/billing/page.tsx) — permanent redirects so
  // existing bookmarks/emails linking to the old profile sub-pages still land
  // on the right content.
  async redirects() {
    return [
      { source: "/dashboard/profile/subscription", destination: "/billing", permanent: true },
      { source: "/dashboard/profile/credits", destination: "/billing?tab=usage", permanent: true },
      { source: "/dashboard/profile/payment-history", destination: "/billing?tab=history", permanent: true },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Source-map upload only runs when SENTRY_AUTH_TOKEN/ORG/PROJECT are set;
// without them this just wraps error/tracing instrumentation with no-op
// upload, so the build stays green with no Sentry account configured yet.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  widenClientFileUpload: true,
});
