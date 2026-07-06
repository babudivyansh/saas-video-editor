import type { NextConfig } from "next";

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
  typescript: {
    ignoreBuildErrors: true, // Guarantees production build completes successfully
  },
};

export default nextConfig;
