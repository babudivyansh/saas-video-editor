// The blog's category vocabulary.
//
// This is a closed table rather than a slugify() over the free-form label
// because a URL slug is a permanent contract: deriving it from the display
// label means renaming "Multi-language" to "Multi Language" silently breaks a
// live, indexed URL with nothing in CI to notice. Keeping the pair explicit
// makes the label editable without touching the slug.
//
// Deliberately imports nothing from ./types or ./posts so that types.ts can
// import BlogCategoryLabel from here without creating a cycle.

// Below this many posts a category page is `noindex, follow` and left out of
// the sitemap: a listing of one or two posts is a thin page competing with the
// posts themselves. It still renders, so links into it keep working.
export const MIN_POSTS_TO_INDEX_CATEGORY = 3;

// `title` is the search title, which names the topic; `label` stays the short
// chip text on cards and breadcrumbs ("Guide articles" told a searcher nothing).
export const BLOG_CATEGORIES = [
  {
    slug: "guide",
    label: "Guide",
    title: "Short-form video guides",
    blurb: "End-to-end walkthroughs for turning long-form footage into short-form content that performs.",
  },
  {
    slug: "tutorial",
    label: "Tutorial",
    title: "Short-form video editing tutorials",
    blurb: "Focused, step-by-step techniques you can apply to your next clip in a single sitting.",
  },
  {
    slug: "growth",
    label: "Growth",
    title: "Growing on Shorts and Reels",
    blurb: "Publishing strategy, algorithm behaviour, and the habits that compound reach over time.",
  },
  {
    slug: "captions",
    label: "Captions",
    title: "Captions for short-form video",
    blurb: "Caption styling, timing, and readability — the details that decide whether viewers keep watching.",
  },
  {
    slug: "multi-language",
    label: "Multi-language",
    title: "Dubbing and localizing video clips",
    blurb: "Dubbing, translation, and localization tactics for reaching audiences beyond your first language.",
  },
  {
    slug: "product",
    label: "Product",
    title: "Clipiro product updates",
    blurb: "What's new in Clipiro, and how to get the most out of each release.",
  },
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export type BlogCategoryLabel = BlogCategory["label"];
export type BlogCategorySlug = BlogCategory["slug"];

export function getCategoryBySlug(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((c) => c.slug === slug);
}

/**
 * Total by construction — `label` is narrowed to the union, so every possible
 * input has a match. The non-null assertion documents that invariant rather
 * than papering over a real lookup failure.
 */
export function getCategoryByLabel(label: BlogCategoryLabel): BlogCategory {
  return BLOG_CATEGORIES.find((c) => c.label === label)!;
}
