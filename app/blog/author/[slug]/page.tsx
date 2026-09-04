import type { Metadata } from "next";
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

  const description = author.bio ?? `Articles written by ${author.name} on the Clipiro blog.`;
  return {
    title: author.name,
    description,
    alternates: { canonical: `/blog/author/${author.slug}` },
    openGraph: { title: `${author.name} · Clipiro Blog`, description },
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
        <section className="border-b border-line bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-20 text-center md:px-12 lg:px-[120px]">
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
                className="mx-auto mt-6 h-20 w-20 rounded-full object-cover"
              />
            )}

            <span className="mt-4 block text-xs font-bold uppercase tracking-widest text-brand">Author</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-ink md:text-5xl">
              {author.name}
            </h1>
            {author.bio && <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">{author.bio}</p>}

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

        <section className="mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12 lg:px-[120px]">
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
