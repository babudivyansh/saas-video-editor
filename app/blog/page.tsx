import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo/social";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { JsonLd } from "@/app/components/JsonLd";
import BlogCta from "./BlogCta";
import NewsletterSignup from "./NewsletterSignup";
import PostCard from "./PostCard";
import { BLOG_CATEGORIES } from "./categories";
import { BLOG_POSTS } from "./posts";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "./schema";

export const metadata: Metadata = {
  title: "Blog: Short-Form Video and Clipping Guides",
  description:
    "Tips, tutorials, and product updates on AI video clipping, captions, and growing your audience with short-form content.",
  alternates: { canonical: "/blog" },
  ...socialMetadata({
    title: "Clipiro Blog",
    description: "Tips, tutorials, and updates on AI-powered short-form video.",
    path: "/blog",
  }),
};

const TOPICS = BLOG_POSTS;

export default function BlogPage() {
  const collectionSchema = buildCollectionPageSchema();
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ]);

  return (
    <div className="min-h-screen bg-bg text-fg font-sans">
      <JsonLd data={collectionSchema} />
      <JsonLd data={breadcrumbSchema} />
      <SiteNavbar solid />
      <main>
        <section className="relative overflow-hidden px-4 pb-6 pt-14 text-center sm:pt-20">
          {/* Soft lime glow behind the headline, as on /pricing. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-380px] h-[700px] w-[800px] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
          />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-5">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Blog</p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl">
              The Clipiro creator playbook
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Tutorials, growth tips, and product updates to help you go viral with short-form video.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 md:px-10 py-16">
          <nav aria-label="Article categories" className="mb-8 flex flex-wrap justify-center gap-2">
            {BLOG_CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/blog/category/${c.slug}`}
                className="rounded-full border border-card-border px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft transition-colors hover:border-brand/40 hover:text-brand"
              >
                {c.label}
              </Link>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>

          <div className="mt-14">
            <BlogCta placement="listing" path="/blog" size="lg" />
          </div>

          <div className="mt-8">
            <NewsletterSignup source="blog_index" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
