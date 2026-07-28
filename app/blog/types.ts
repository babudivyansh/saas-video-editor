// Shared shape for blog post data — see posts.ts for the aggregated list and
// app/blog/content/*.ts for the actual per-post data.
import type { BlogCategoryLabel } from "./categories";

export interface BlogParagraph {
  /** Present only on the paragraph that opens a new H2 section. */
  heading?: string;
  /** Bolded opening phrase of the paragraph. */
  lead?: string;
  text: string;
}

/**
 * Local images only (served from public/blog/<post-slug>/). Keeping them local
 * means `img-src 'self'` already covers them — a remote host would need a new
 * entry in BOTH next.config.ts `images.remotePatterns` AND the CSP `img-src`
 * list, which is two edits in two places that are easy to half-do.
 */
export interface BlogImage {
  /** App-root-relative, e.g. "/blog/podcast-to-viral-clips/hero.webp". */
  src: string;
  alt: string;
  /** Intrinsic dimensions — required by next/image without `fill`, and by BlogPosting.image. */
  width: number;
  height: number;
  caption?: string;
  /**
   * Attribution rendered under the image. Inline rather than a
   * public/blog/_manifest.json sidecar (the pattern public/tools uses) because
   * this one is actually rendered, and a sidecar is unreachable from a server
   * component without a build-time fs read — a second source of truth for no gain.
   */
  credit?: { name: string; url?: string };
}

/**
 * Article body content. A discriminated union, but with an OPTIONAL
 * discriminant on the paragraph arm: that keeps every existing paragraph
 * object valid without a `type: "paragraph"` field, so introducing this union
 * required renaming one field per content file and editing zero paragraphs.
 *
 * The alternative — optional `callout?`/`cta?` fields bolted onto
 * BlogParagraph — was rejected because it makes every callout parasitic on a
 * paragraph (never placeable between two sections) and forces getReadingTime
 * and the TOC to special-case fields they shouldn't know about.
 */
export type BlogBlock =
  | ({ type?: "paragraph" } & BlogParagraph)
  | { type: "callout"; tone: CalloutTone; title?: string; text: string }
  | { type: "cta"; heading?: string; body?: string; label?: string; href?: string }
  | { type: "image"; image: BlogImage };

export type CalloutTone = "tip" | "warning" | "note" | "stat";

export function isParagraphBlock(block: BlogBlock): block is { type?: "paragraph" } & BlogParagraph {
  return block.type === undefined || block.type === "paragraph";
}

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogAuthor {
  /**
   * Stable URL segment for /blog/author/<slug>. Required — a hub URL is a
   * contract. Several bylines may share a slug when they're the same entity in
   * different roles; the hub indexes by slug and collapses them into one page.
   */
  slug: string;
  name: string;
  /** Describes the post's byline, not the author entity — varies per post. */
  role: string;
  bio?: string;
  avatar?: BlogImage;
  links?: { label: string; href: string }[];
  /**
   * Drives BlogPosting.author's @type. Defaults to Organization: emitting a
   * schema.org Person for a name that isn't a real individual is worse for
   * E-E-A-T than an honest Organization.
   */
  kind?: "Person" | "Organization";
}

export interface BlogPost {
  slug: string;
  category: BlogCategoryLabel;
  title: string;
  /** Distinct from `intro` — used for <meta description>, OG, and Twitter cards. */
  metaDescription: string;
  intro: string;
  /** ISO date string, e.g. "2025-01-14". */
  publishedAt: string;
  /** ISO date string; equal to publishedAt if the post has never been revised. */
  updatedAt: string;
  author: BlogAuthor;
  /** Optional — posts without a hero fall back to the gradient placeholder. */
  hero?: BlogImage;
  body: BlogBlock[];
  /** Single source of truth for both the on-page FAQ accordion and FAQPage schema. */
  faqs: BlogFaq[];
  closing: string;
}
