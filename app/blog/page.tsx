import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { BLOG_POSTS } from "./posts";
import { getReadingTime } from "./utils";
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:border-[#335CFF]/30 hover:shadow-md"
              >
                <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-[#335CFF]/10 to-purple-400/10">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#335CFF]">
                    {post.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-base font-bold leading-snug text-gray-900 group-hover:text-[#335CFF]">{post.title}</h3>
                  <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-gray-400">
                    <span>{getReadingTime(post)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-14 rounded-3xl border border-[#E8EDFF] bg-gradient-to-br from-[#335CFF]/[0.04] to-purple-400/[0.04] p-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900">Ready to put this into practice?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Start turning your own long-form videos into clips with Clipiro.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-8 py-3.5 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
