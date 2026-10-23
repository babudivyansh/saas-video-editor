import type { MetadataRoute } from "next";

// Web app manifest (/manifest.webmanifest): name, colours and icon for "Add to
// home screen" and for the browser's own UI. Colours are the dark emerald
// system's background (app/globals.css --bg); the app is dark-only. A manifest
// is read outside any stylesheet, so it needs the literal value, not the token.
const EMERALD_BG = "#050908";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clipiro",
    short_name: "Clipiro",
    description: "Turn long videos into short, captioned clips for Shorts, Reels and TikTok.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: EMERALD_BG,
    theme_color: EMERALD_BG,
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
