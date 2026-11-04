import type { MetadataRoute } from "next";
import { BLOG_CATEGORIES, MIN_POSTS_TO_INDEX_CATEGORY } from "./blog/categories";
import { BLOG_POSTS } from "./blog/posts";
import { getAuthorIndex, getPostsByAuthor, getPostsByCategory } from "./blog/utils";
import { HELP_ARTICLES } from "./help/articles";
import { LEGAL_DOCS } from "./legal/documents";
import { ALL_TOOLS } from "./components/featureLinks";
import { getToolContent } from "./tools/content";
import { COMPETITORS, COMPETITORS_CHECKED_ON } from "./compare/data";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://clipiro.com";

  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // lastModified is the freshest post in each category rather than new Date():
  // a category page's content only actually changes when one of its posts does,
  // and "always now" trains crawlers to ignore the field.
  const categoryEntries: MetadataRoute.Sitemap = BLOG_CATEGORIES.flatMap((category) => {
    const posts = getPostsByCategory(category.slug, BLOG_POSTS);
    // Thin categories are noindex (app/blog/category/[slug]/page.tsx); listing
    // a noindex URL in the sitemap sends Search Console mixed signals.
    if (posts.length < MIN_POSTS_TO_INDEX_CATEGORY) return [];
    return [
      {
        url: `${base}/blog/category/${category.slug}`,
        lastModified: posts.reduce((latest, p) => (p.updatedAt > latest ? p.updatedAt : latest), posts[0].updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      },
    ];
  });

  const authorEntries: MetadataRoute.Sitemap = [...getAuthorIndex(BLOG_POSTS).keys()].flatMap((slug) => {
    const posts = getPostsByAuthor(slug, BLOG_POSTS);
    if (posts.length === 0) return [];
    return [
      {
        url: `${base}/blog/author/${slug}`,
        lastModified: posts.reduce((latest, p) => (p.updatedAt > latest ? p.updatedAt : latest), posts[0].updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.4,
      },
    ];
  });

  // The one DB-backed read, only for /reviews' lastmod: individual review
  // pages are noindex (app/reviews/[id]/page.tsx), so they aren't listed. If
  // the database is unreachable the rest of the sitemap is still valid.
  const publishedReviews = await prisma.review
    .findMany({
      where: { status: "published" },
      select: { updatedAt: true },
    })
    .catch(() => []);

  // lastModified is each document's own `updated` date rather than new Date():
  // legal text changes rarely, and an always-now timestamp is exactly the
  // signal crawlers learn to discount.
  const legalEntries: MetadataRoute.Sitemap = LEGAL_DOCS.map((doc) => ({
    url: `${base}${doc.slug}`,
    lastModified: doc.updated,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  // The tool pages are the site's main organic surface — one indexable page per
  // tool, each targeting its own search intent. Priority sits just under
  // /pricing and above the blog for that reason.
  // Tool and help pages carry their own updatedAt (the date their copy was
  // last checked against the product). The static marketing pages have no
  // edit date anywhere in the code, so they omit lastModified rather than
  // claim "now" on every fetch — Google ignores a lastmod it has caught being
  // wrong, but treats a missing one as simply unknown.
  const toolEntries: MetadataRoute.Sitemap = ALL_TOOLS.map((tool) => ({
    url: `${base}/tools/${tool.slug}`,
    lastModified: getToolContent(tool.slug)?.updatedAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const helpEntries: MetadataRoute.Sitemap = HELP_ARTICLES.map((a) => ({
    url: `${base}/help/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Index pages change exactly when their newest entry does.
  const latest = (dates: (string | Date)[]) =>
    dates.length === 0 ? undefined : dates.map((d) => new Date(d)).reduce((a, b) => (b > a ? b : a));

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/tools`, changeFrequency: "weekly", priority: 0.9 },
    ...toolEntries,
    { url: `${base}/caption-templates`, changeFrequency: "weekly", priority: 0.7 },
    ...CAPTION_FAMILIES.filter((f) => CAPTION_TEMPLATES.some((t) => t.family === f.id)).map((f) => ({
      url: `${base}/caption-templates/${f.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    { url: `${base}/compare`, lastModified: COMPETITORS_CHECKED_ON, changeFrequency: "monthly", priority: 0.7 },
    ...COMPETITORS.map((c) => ({
      url: `${base}/compare/${c.slug}`,
      lastModified: COMPETITORS_CHECKED_ON,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/blog`, lastModified: latest(BLOG_POSTS.map((p) => p.updatedAt)), changeFrequency: "weekly", priority: 0.7 },
    ...categoryEntries,
    ...authorEntries,
    ...blogEntries,
    { url: `${base}/reviews`, lastModified: latest(publishedReviews.map((r) => r.updatedAt)), changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/help`, changeFrequency: "weekly", priority: 0.6 },
    ...helpEntries,
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/affiliate-program`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/legal`, lastModified: latest(LEGAL_DOCS.map((d) => d.updated)), changeFrequency: "yearly", priority: 0.4 },
    ...legalEntries,
  ];
}
