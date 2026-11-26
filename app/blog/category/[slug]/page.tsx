import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo/social";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { JsonLd } from "@/app/components/JsonLd";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { BLOG_CATEGORIES, MIN_POSTS_TO_INDEX_CATEGORY, getCategoryBySlug } from "../../categories";
import BlogCta from "../../BlogCta";
import NewsletterSignup from "../../NewsletterSignup";
import PostCard from "../../PostCard";
import { BLOG_POSTS } from "../../posts";
import { getPostsByCategory } from "../../utils";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "../../schema";

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  const thin = getPostsByCategory(category.slug, BLOG_POSTS).length < MIN_POSTS_TO_INDEX_CATEGORY;
  return {
    title: category.title,
    description: category.blurb,
    alternates: { canonical: `/blog/category/${category.slug}` },
    ...(thin && { robots: { index: false, follow: true } }),
    ...socialMetadata({
      title: `${category.title} · Clipiro Blog`,
      description: category.blurb,
      path: `/blog/category/${category.slug}`,
    }),
  };
}

export default async function BlogCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const posts = getPostsByCategory(category.slug, BLOG_POSTS);

  const collectionSchema = buildCollectionPageSchema({
    name: category.title,
    description: category.blurb,
    path: `/blog/category/${category.slug}`,
  });
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: category.label, path: `/blog/category/${category.slug}` },
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
            <div className="flex justify-center">
              <Breadcrumbs
                items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: category.label }]}
              />
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Category</p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl">
              {category.title}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">{category.blurb}</p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 md:px-10 py-16">
          {posts.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<span className="text-2xl">✍️</span>}
              title={`No ${category.label} articles yet`}
              subtitle="We're working on it. In the meantime, browse everything we've published so far."
              action={{ label: "Back to all articles", href: "/blog" }}
            />
          )}

          <div className="mt-14">
            <BlogCta placement="listing" path={`/blog/category/${category.slug}`} size="lg" />
          </div>

          <div className="mt-8">
            <NewsletterSignup source={`blog_category_${category.slug}`} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
