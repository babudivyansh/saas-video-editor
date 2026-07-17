import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { BLOG_POSTS, getBlogPost } from "../posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.intro,
    openGraph: { title: post.title, description: post.intro },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main>
        <article className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
          <Link href="/blog" className="text-xs font-bold uppercase tracking-widest text-[#335CFF] hover:underline">
            ← Blog
          </Link>

          <span className="mt-5 inline-block rounded-full bg-[#335CFF]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#335CFF]">
            {post.tag}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-gray-400">{post.read}</p>

          <p className="mt-8 text-lg leading-relaxed text-gray-700">{post.intro}</p>

          <div className="mt-6 space-y-5">
            {post.paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-gray-700">
                {p.lead && <strong className="font-bold text-gray-900">{p.lead} </strong>}
                {p.text}
              </p>
            ))}
          </div>

          <p className="mt-6 text-[15px] leading-relaxed text-gray-700">{post.closing}</p>

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
                    <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">{r.tag}</span>
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
