import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
};

// Source-map upload only runs when SENTRY_AUTH_TOKEN/ORG/PROJECT are set;
// without them this just wraps error/tracing instrumentation with no-op
// upload, so the build stays green with no Sentry account configured yet.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  widenClientFileUpload: true,
});
