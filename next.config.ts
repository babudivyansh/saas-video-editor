import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Optimizes build size for Node.js shared hosting
  // Keep ffmpeg-static out of the server bundle so its __dirname-based binary
  // path resolves correctly at runtime instead of being rewritten to "\ROOT\".
  serverExternalPackages: ["ffmpeg-static"],
  turbopack: {
    // Pin the workspace root to this project. Without this, Next can infer the
    // wrong root if an ancestor directory (e.g. the home dir) contains a stray
    // lockfile, which misplaces Turbopack's on-disk cache and can break dev.
    root: __dirname,
  },
};

export default nextConfig;
