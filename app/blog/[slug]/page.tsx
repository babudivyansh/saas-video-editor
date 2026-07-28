import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import BlogCta from "../BlogCta";
import Callout from "../Callout";
import NewsletterSignup from "../NewsletterSignup";
import { getCategoryByLabel } from "../categories";
import { BLOG_POSTS, getBlogPost } from "../posts";
import { isParagraphBlock } from "../types";
import { getReadingTime, getRelatedPosts, formatDate, withMidArticleCta } from "../utils";
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
  const category = getCategoryByLabel(post.category);
  // Adds a mid-article CTA at a section boundary unless the post already
  // places one explicitly.
  const body = withMidArticleCta(post.body);

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

          <Link
            href={`/blog/category/${category.slug}`}
            className="mt-5 inline-block rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand transition-colors hover:bg-brand/20"
          >
            {post.category}
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-gray-400">
            {post.author.name} · {post.author.role} · {getReadingTime(post)} · Updated {formatDate(post.updatedAt)}
          </p>

          {post.hero && (
            <figure className="mt-8">
              <Image
                src={post.hero.src}
                alt={post.hero.alt}
                width={post.hero.width}
                height={post.hero.height}
                priority
                sizes="(min-width: 768px) 768px, 100vw"
                className="w-full rounded-[var(--radius-card)] object-cover"
              />
              {(post.hero.caption || post.hero.credit) && (
                <figcaption className="mt-2 text-xs text-ink-soft">
                  {post.hero.caption}
                  {post.hero.caption && post.hero.credit ? " · " : ""}
                  {post.hero.credit &&
                    (post.hero.credit.url ? (
                      <a href={post.hero.credit.url} className="underline" rel="noopener noreferrer nofollow">
                        {post.hero.credit.name}
                      </a>
                    ) : (
                      post.hero.credit.name
                    ))}
                </figcaption>
              )}
            </figure>
          )}

          <p className="mt-8 text-lg leading-relaxed text-gray-700">{post.intro}</p>

          <div className="mt-6 space-y-5">
            {body.map((block, i) => {
              if (isParagraphBlock(block)) {
                return (
                  <div key={i}>
                    {block.heading && (
                      <h2 className="mb-3 mt-8 text-xl font-extrabold text-gray-900 md:text-2xl">{block.heading}</h2>
                    )}
                    <p className="text-[15px] leading-relaxed text-gray-700">
                      {block.lead && <strong className="font-bold text-gray-900">{block.lead} </strong>}
                      {block.text}
                    </p>
                  </div>
                );
              }
              if (block.type === "callout") {
                return <Callout key={i} tone={block.tone} title={block.title} text={block.text} />;
              }
              if (block.type === "cta") {
                return (
                  <div key={i} className="my-10">
                    <BlogCta
                      placement="mid_article"
                      path={`/blog/${post.slug}`}
                      heading={block.heading}
                      body={block.body}
                      label={block.label}
                      href={block.href}
                    />
                  </div>
                );
              }
              return (
                <figure key={i} className="my-8">
                  <Image
                    src={block.image.src}
                    alt={block.image.alt}
                    width={block.image.width}
                    height={block.image.height}
                    sizes="(min-width: 768px) 768px, 100vw"
                    className="w-full rounded-[var(--radius-card)] object-cover"
                  />
                  {block.image.caption && (
                    <figcaption className="mt-2 text-xs text-ink-soft">{block.image.caption}</figcaption>
                  )}
                </figure>
              );
            })}
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

          <div className="mt-12">
            <BlogCta placement="article_footer" path={`/blog/${post.slug}`} />
          </div>

          <div className="mt-8">
            <NewsletterSignup source="blog_article" />
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
