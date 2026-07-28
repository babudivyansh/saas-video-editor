import Image from "next/image";
import Link from "next/link";
import { getCategoryByLabel } from "./categories";
import type { BlogPost } from "./types";
import { getReadingTime } from "./utils";

/**
 * Shared by the blog index and the category pages.
 *
 * The card is deliberately NOT a single wrapping <Link>: the category pill is
 * its own link, and nesting an <a> inside an <a> is invalid HTML that React
 * will happily render anyway. Instead the title link stretches over the whole
 * card via an ::after overlay, and the pill sits above it on the z-axis.
 */
export default function PostCard({ post }: { post: BlogPost }) {
  const category = getCategoryByLabel(post.category);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-card-border bg-white shadow-card transition-all hover:border-brand/30 hover:shadow-card-hover">
      <div className="relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-brand/10 to-accent-violet/10">
        {post.hero && (
          <Image
            src={post.hero.src}
            alt={post.hero.alt}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        <Link
          href={`/blog/category/${category.slug}`}
          className="relative z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand backdrop-blur-sm transition-colors hover:bg-white"
        >
          {post.category}
        </Link>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-base font-bold leading-snug text-ink group-hover:text-brand">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {post.title}
          </Link>
        </h3>
        <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-ink-soft">
          <span>{getReadingTime(post)}</span>
        </div>
      </div>
    </article>
  );
}
