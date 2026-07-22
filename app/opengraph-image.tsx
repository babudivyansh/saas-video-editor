import { ImageResponse } from "next/og";

export const alt = "Clipiro — Create Viral Shorts From Long Videos in Seconds";
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
          background: "linear-gradient(135deg, #335CFF 0%, #7C3AED 55%, #D946EF 100%)",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-2px",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            ▶
          </div>
          Clipiro
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 58,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            maxWidth: 980,
          }}
        >
          Create viral shorts from long videos in seconds
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            opacity: 0.92,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          AI clipping, captions, and one-click formatting for TikTok, Reels &amp; Shorts
        </div>
      </div>
    ),
    size,
  );
}
