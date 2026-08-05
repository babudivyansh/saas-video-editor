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
  // Content-Security-Policy moved to proxy.ts (see lib/csp.ts) so it can
  // carry a per-request nonce — next.config.ts's headers() is static and
  // can't vary per request. Every other security header here doesn't need
  // one, so they stay declared statically.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
      // Billing is an overlay now, not a route. /billing must keep resolving:
      // four email CTAs and the auto-top-up link hardcode
      // https://clipiro.com/billing, and Notification rows in the database
      // carry href "/billing" — none of which can be edited retroactively.
      // Query strings forward automatically (same mechanism the /signup
      // redirect below relies on), so /billing?tab=history arrives intact.
      { source: "/billing", destination: "/dashboard?billing=1", permanent: true },
      { source: "/dashboard/profile/subscription", destination: "/dashboard?billing=1", permanent: true },
      { source: "/dashboard/profile/credits", destination: "/dashboard?billing=1&tab=usage", permanent: true },
      { source: "/dashboard/profile/payment-history", destination: "/dashboard?billing=1&tab=history", permanent: true },
      // /signup never existed as a route — every affiliate referral link
      // generated before this fix points here. redirects() runs before Proxy
      // (see proxy.ts), and the query string forwards automatically, so
      // proxy.ts still sees ?ref= on the resulting /register request.
      { source: "/signup", destination: "/register", permanent: true },
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
