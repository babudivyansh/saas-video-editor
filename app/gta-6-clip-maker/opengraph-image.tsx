import { ImageResponse } from "next/og";
import { GTA6_CONTENT } from "./content";

// Share card for /gta-6-clip-maker. Text only, in Clipiro's own colours: no
// game art or logo, since Rockstar's policy bars using its material to promote
// a product and the card must not look official. Same layout as the tool
// pages' cards (app/tools/[slug]/opengraph-image.tsx).
export const alt = "Clipiro: turn your GTA 6 streams into Shorts, Reels and TikToks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #050908 0%, #06291c 55%, #00a968 100%)",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
            padding: "10px 24px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          For streamers · AutoClip
        </div>
        <div style={{ marginTop: 40, fontSize: 62, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-1.5px", maxWidth: 1000 }}>
          {GTA6_CONTENT.h1}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: 48, fontSize: 32, fontWeight: 800, opacity: 0.92 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            ▶
          </div>
          Clipiro
        </div>
      </div>
    ),
    size,
  );
}
