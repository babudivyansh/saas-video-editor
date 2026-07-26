// Shared shape for blog post data — see posts.ts for the aggregated list and
// app/blog/content/*.ts for the actual per-post data.
export interface BlogParagraph {
  /** Present only on the paragraph that opens a new H2 section. */
  heading?: string;
  /** Bolded opening phrase of the paragraph. */
  lead?: string;
  text: string;
}

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogAuthor {
  name: string;
  role: string;
}

export interface BlogPost {
  slug: string;
  category: string;
  title: string;
  /** Distinct from `intro` — used for <meta description>, OG, and Twitter cards. */
  metaDescription: string;
  intro: string;
  /** ISO date string, e.g. "2025-01-14". */
  publishedAt: string;
  /** ISO date string; equal to publishedAt if the post has never been revised. */
  updatedAt: string;
  author: BlogAuthor;
  paragraphs: BlogParagraph[];
  /** Single source of truth for both the on-page FAQ accordion and FAQPage schema. */
  faqs: BlogFaq[];
  closing: string;
}
