import Image from "next/image";
import Link from "next/link";
import { getCategoryByLabel } from "./categories";
import PostCover from "./PostCover";
import type { BlogPost } from "./types";
import { getReadingTime } from "./utils";

/**
 * Shared by the blog index and the category pages.
 *
 * The card is deliberately NOT a single wrapping <Link>: the category pill is
 * its own link, and nesting an <a> inside an <a> is invalid HTML that React
 * will happily render anyway. Instead the title link stretches over the whole
 * card via an ::after overlay, and the pill sits above it on the z-axis.
 *
 * Hover motion is wrapped in `motion-safe:` throughout, so a reader who has
 * asked their OS to reduce motion still gets the colour and shadow feedback
 * without anything sliding or scaling.
 */
export default function PostCard({ post }: { post: BlogPost }) {
  const category = getCategoryByLabel(post.category);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-card-border bg-panel shadow-card transition-all duration-300 ease-out hover:border-brand/30 hover:shadow-card-hover motion-safe:hover:-translate-y-1">
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br from-brand/10 to-accent-violet/10">
        {/* The artwork scales inside a clipped box, so the card's own edges
            stay put while the image fills toward them. */}
        <div className="absolute inset-0 transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.06]">
          {post.hero ? (
            <Image
              src={post.hero.src}
              alt={post.hero.alt}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <PostCover category={category.slug} label={post.category} />
          )}
        </div>

        {/* Deepens on hover so the white pill keeps its contrast against the
            artwork as the artwork brightens. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <Link
          href={`/blog/category/${category.slug}`}
          className="relative z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand backdrop-blur-sm transition-colors hover:bg-panel"
        >
          {post.category}
        </Link>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-base font-bold leading-snug text-ink transition-colors duration-200 group-hover:text-brand">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {post.title}
          </Link>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-ink-soft">
          <span>{getReadingTime(post)}</span>
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 font-semibold text-brand opacity-0 transition-all duration-300 ease-out group-hover:opacity-100 motion-safe:translate-x-1 motion-safe:group-hover:translate-x-0"
          >
            Read
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  );
}
