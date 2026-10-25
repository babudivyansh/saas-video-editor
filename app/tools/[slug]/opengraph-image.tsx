import { ImageResponse } from "next/og";
import { ALL_TOOLS, CATEGORY_LABELS, getToolBySlug } from "@/app/components/featureLinks";
import { getToolContent } from "../content";

// Per-tool share card. Without it every tool page inherited the root card, so
// a shared /tools/background-remover link previewed as the generic homepage
// pitch. Text rather than the tool's artwork: the artwork is WebP, which the
// ImageResponse renderer cannot embed.
export const alt = "Clipiro tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return ALL_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  const content = getToolContent(slug);
  const eyebrow = tool ? `${CATEGORY_LABELS[tool.category]} · ${tool.title}` : "Clipiro Tools";
  const headline = content?.h1 ?? "Create viral shorts from long videos in seconds";

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
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 62,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-1.5px",
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: 48,
            fontSize: 32,
            fontWeight: 800,
            opacity: 0.92,
          }}
        >
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
