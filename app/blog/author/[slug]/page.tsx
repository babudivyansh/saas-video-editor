import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo/social";
import Image from "next/image";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { JsonLd } from "@/app/components/JsonLd";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import NewsletterSignup from "../../NewsletterSignup";
import PostCard from "../../PostCard";
import { BLOG_POSTS } from "../../posts";
import { getAuthorIndex, getPostsByAuthor } from "../../utils";
import { buildBreadcrumbSchema, buildProfilePageSchema } from "../../schema";

// Derived from the posts, so an author with nothing published can never get a
// page. Note the three "Clipiro Team" bylines share one slug and therefore
// produce a single page here, not three.
export function generateStaticParams() {
  return [...getAuthorIndex(BLOG_POSTS).keys()].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const author = getAuthorIndex(BLOG_POSTS).get(slug);
  if (!author) return { title: "Author not found" };

  const description = author.metaDescription ?? author.bio ?? `Articles written by ${author.name} on the Clipiro blog.`;
  return {
    title: author.name,
    description,
    alternates: { canonical: `/blog/author/${author.slug}` },
    ...socialMetadata({ title: `${author.name} · Clipiro Blog`, description, path: `/blog/author/${author.slug}` }),
  };
}

export default async function BlogAuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = getAuthorIndex(BLOG_POSTS).get(slug);
  if (!author) notFound();

  const posts = getPostsByAuthor(slug, BLOG_POSTS);

  const profileSchema = buildProfilePageSchema(author, posts);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: author.name, path: `/blog/author/${author.slug}` },
  ]);

  return (
    <div className="min-h-screen bg-bg text-fg font-sans">
      <JsonLd data={profileSchema} />
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
                items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: author.name }]}
              />
            </div>

            {author.avatar && (
              <Image
                src={author.avatar.src}
                alt={author.avatar.alt}
                width={author.avatar.width}
                height={author.avatar.height}
                className="h-20 w-20 rounded-full object-cover"
              />
            )}

            <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Author</p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl">
              {author.name}
            </h1>
            {author.bio && <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">{author.bio}</p>}

            {author.links && author.links.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-4">
                {author.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    rel="noopener noreferrer me"
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            <p className="mt-5 text-sm text-ink-soft">
              {posts.length} {posts.length === 1 ? "article" : "articles"}
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 md:px-10 py-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>

          <div className="mt-14">
            <NewsletterSignup source="blog_author" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
