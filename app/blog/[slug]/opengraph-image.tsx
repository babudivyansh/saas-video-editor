import { ImageResponse } from "next/og";
import { BLOG_POSTS, getBlogPost } from "../posts";

export const alt = "Clipiro Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const category = post?.category ?? "Blog";
  const title = post?.title ?? "Clipiro Blog";

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
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
            padding: "10px 24px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {category}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 58,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            maxWidth: 980,
          }}
        >
          {title}
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
