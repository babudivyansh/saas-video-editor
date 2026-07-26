import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import { BLOG_POSTS, getBlogPost } from "../posts";
import { getReadingTime, getRelatedPosts, formatDate } from "../utils";
import { buildBlogPostingSchema, buildBreadcrumbSchema, buildFaqPageSchema } from "../schema";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.metaDescription,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
    },
    twitter: {
      title: post.title,
      description: post.metaDescription,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = getRelatedPosts(post, BLOG_POSTS, 2);

  const blogPostingSchema = buildBlogPostingSchema(post);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);
  const faqSchema = post.faqs.length > 0 ? buildFaqPageSchema(post.faqs) : null;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}
      <SiteNavbar solid />
      <main>
        <article className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Blog", href: "/blog" },
              { label: post.title },
            ]}
          />

          <span className="mt-5 inline-block rounded-full bg-[#335CFF]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#335CFF]">
            {post.category}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-gray-400">
            {post.author.name} · {post.author.role} · {getReadingTime(post)} · Updated {formatDate(post.updatedAt)}
          </p>

          <p className="mt-8 text-lg leading-relaxed text-gray-700">{post.intro}</p>

          <div className="mt-6 space-y-5">
            {post.paragraphs.map((p, i) => (
              <div key={i}>
                {p.heading && (
                  <h2 className="mb-3 mt-8 text-xl font-extrabold text-gray-900 md:text-2xl">{p.heading}</h2>
                )}
                <p className="text-[15px] leading-relaxed text-gray-700">
                  {p.lead && <strong className="font-bold text-gray-900">{p.lead} </strong>}
                  {p.text}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[15px] leading-relaxed text-gray-700">{post.closing}</p>

          {post.faqs.length > 0 && (
            <div className="mt-14 border-t border-gray-100 pt-10">
              <h2 className="text-xl font-extrabold text-gray-900">Frequently asked questions</h2>
              <div className="mt-5">
                <FaqAccordion items={post.faqs.map((f) => ({ question: f.question, answer: f.answer }))} />
              </div>
            </div>
          )}

          <div className="mt-12 rounded-2xl border border-[#E8EDFF] bg-gradient-to-br from-[#335CFF]/[0.04] to-purple-400/[0.04] p-8 text-center">
            <h2 className="text-xl font-extrabold text-gray-900">Ready to put this into practice?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Start turning your own long-form videos into clips with Clipiro.
            </p>
            <Link
              href="/pricing"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#335CFF] px-7 py-3 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
            >
              Get started free
            </Link>
          </div>

          {related.length > 0 && (
            <div className="mt-14 border-t border-gray-100 pt-10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Read next</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="group rounded-xl border border-gray-100 p-5 transition-colors hover:border-[#335CFF]/30"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">{r.category}</span>
                    <p className="mt-1.5 text-sm font-bold leading-snug text-gray-900 group-hover:text-[#335CFF]">{r.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
