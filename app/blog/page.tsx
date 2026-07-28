import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import BlogCta from "./BlogCta";
import NewsletterSignup from "./NewsletterSignup";
import PostCard from "./PostCard";
import { BLOG_CATEGORIES } from "./categories";
import { BLOG_POSTS } from "./posts";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "./schema";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Tips, tutorials, and product updates on AI video clipping, captions, and growing your audience with short-form content.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Clipiro Blog",
    description: "Tips, tutorials, and updates on AI-powered short-form video.",
  },
};

const TOPICS = BLOG_POSTS;

export default function BlogPage() {
  const collectionSchema = buildCollectionPageSchema();
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <SiteNavbar solid />
      <main>
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px]">
            <div className="flex justify-center">
              <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />
            </div>
            <span className="mt-4 block text-xs font-bold uppercase tracking-widest text-[#335CFF]">Blog</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-gray-900 md:text-6xl">
              The Clipiro creator playbook
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Tutorials, growth tips, and product updates to help you go viral with short-form video.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
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
