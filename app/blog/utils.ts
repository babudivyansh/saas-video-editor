import type { BlogPost } from "./types";

const WORDS_PER_MINUTE = 225;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function getReadingTime(post: BlogPost): string {
  const words =
    wordCount(post.intro) +
    post.paragraphs.reduce((sum, p) => sum + wordCount(p.heading ?? "") + wordCount(p.lead ?? "") + wordCount(p.text), 0) +
    wordCount(post.closing) +
    post.faqs.reduce((sum, f) => sum + wordCount(f.question) + wordCount(f.answer), 0);

  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/**
 * Same-category posts first (most recent first), then fills remaining slots
 * with the most recent posts from other categories. Written to still make
 * sense once the blog has far more than a handful of posts.
 */
export function getRelatedPosts(post: BlogPost, allPosts: BlogPost[], limit = 2): BlogPost[] {
  const others = allPosts.filter((p) => p.slug !== post.slug);
  const byRecency = (a: BlogPost, b: BlogPost) => (a.updatedAt < b.updatedAt ? 1 : -1);

  const sameCategory = others.filter((p) => p.category === post.category).sort(byRecency);
  const rest = others.filter((p) => p.category !== post.category).sort(byRecency);

  return [...sameCategory, ...rest].slice(0, limit);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
