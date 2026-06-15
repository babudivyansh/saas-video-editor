import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep ffmpeg-static out of the server bundle so its __dirname-based binary
  // path resolves correctly at runtime instead of being rewritten to "\ROOT\".
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
