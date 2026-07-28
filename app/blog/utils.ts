import { getCategoryBySlug } from "./categories";
import { slugifyAll } from "./slug";
import { isParagraphBlock, type BlogAuthor, type BlogBlock, type BlogPost } from "./types";

const WORDS_PER_MINUTE = 225;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Words a reader actually reads. A CTA block scores 0 — it's an action, not prose. */
function blockWordCount(block: BlogBlock): number {
  if (isParagraphBlock(block)) {
    return wordCount(block.heading ?? "") + wordCount(block.lead ?? "") + wordCount(block.text);
  }
  switch (block.type) {
    case "callout":
      return wordCount(block.title ?? "") + wordCount(block.text);
    case "image":
      return wordCount(block.image.caption ?? "");
    case "cta":
      return 0;
  }
}

export function getReadingTime(post: BlogPost): string {
  const words =
    wordCount(post.intro) +
    post.body.reduce((sum, block) => sum + blockWordCount(block), 0) +
    wordCount(post.closing) +
    post.faqs.reduce((sum, f) => sum + wordCount(f.question) + wordCount(f.answer), 0);

  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/**
 * Newest first. Falls through updatedAt -> publishedAt -> slug so the order is
 * total and stable: every post currently shares the same updatedAt, and a
 * comparator that returns -1 on equality is inconsistent (undefined behaviour
 * for Array.sort, and in practice a silent no-op).
 */
function byRecency(a: BlogPost, b: BlogPost): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  return a.slug < b.slug ? -1 : 1;
}

/**
 * Same-category posts first (most recent first), then fills remaining slots
 * with the most recent posts from other categories. Written to still make
 * sense once the blog has far more than a handful of posts.
 */
export function getRelatedPosts(post: BlogPost, allPosts: BlogPost[], limit = 2): BlogPost[] {
  const others = allPosts.filter((p) => p.slug !== post.slug);
  const sameCategory = others.filter((p) => p.category === post.category).sort(byRecency);
  const rest = others.filter((p) => p.category !== post.category).sort(byRecency);

  return [...sameCategory, ...rest].slice(0, limit);
}

/** Empty array for an unknown slug — the caller decides whether that's a 404. */
export function getPostsByCategory(slug: string, allPosts: BlogPost[]): BlogPost[] {
  const category = getCategoryBySlug(slug);
  if (!category) return [];
  return allPosts.filter((p) => p.category === category.label).sort(byRecency);
}

/**
 * Inserts a mid-article CTA at the section boundary nearest the halfway point,
 * unless the author already placed one explicitly.
 *
 * Purely positional insertion ("after N paragraphs") was rejected: it lands the
 * CTA mid-section or directly beneath an H2, and on a post where every
 * paragraph opens its own section it is wrong by construction. Anchoring to a
 * section boundary means the CTA always sits between two sections, and posts
 * with too little structure to place it well get nothing rather than something
 * broken.
 */
export function withMidArticleCta(body: BlogBlock[]): BlogBlock[] {
  if (body.some((b) => b.type === "cta")) return body;

  const boundaries = body
    .map((block, i) => (i > 0 && isParagraphBlock(block) && block.heading ? i : -1))
    .filter((i) => i > 0 && i < body.length - 1);

  if (boundaries.length < 2) return body;

  const total = body.reduce((sum, b) => sum + blockWordCount(b), 0);
  if (total === 0) return body;

  let running = 0;
  const cumulative = body.map((b) => (running += blockWordCount(b)));

  const target = total / 2;
  const insertAt = boundaries.reduce((best, i) =>
    Math.abs(cumulative[i - 1] - target) < Math.abs(cumulative[best - 1] - target) ? i : best,
  );

  return [...body.slice(0, insertAt), { type: "cta" as const }, ...body.slice(insertAt)];
}

/**
 * Authors that actually have published posts, keyed by slug.
 *
 * Derived from the posts rather than from the AUTHORS record so a stale or
 * unused entry can never produce an empty, indexable author page. Bylines
 * sharing a slug collapse to one entry, which is what keeps the three
 * "Clipiro Team" roles from becoming three near-duplicate pages.
 */
export function getAuthorIndex(allPosts: BlogPost[]): Map<string, BlogAuthor> {
  const index = new Map<string, BlogAuthor>();
  for (const post of allPosts) {
    if (!index.has(post.author.slug)) index.set(post.author.slug, post.author);
  }
  return index;
}

export function getPostsByAuthor(slug: string, allPosts: BlogPost[]): BlogPost[] {
  return allPosts.filter((p) => p.author.slug === slug).sort(byRecency);
}

export interface TocItem {
  id: string;
  text: string;
}

/**
 * The article's H2 outline, with collision-safe anchor ids.
 *
 * The renderer MUST take each heading's `id` from this array rather than
 * calling slugify() per heading at render time: two headings that slugify
 * identically would then emit the same id twice, and both TOC links would
 * silently jump to the first one.
 */
export function getTocItems(post: BlogPost): TocItem[] {
  const headings = post.body
    .filter(isParagraphBlock)
    .map((block) => block.heading)
    .filter((heading): heading is string => Boolean(heading));

  return slugifyAll(headings).map((id, i) => ({ id, text: headings[i] }));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
