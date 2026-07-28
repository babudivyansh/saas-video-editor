import type { MetadataRoute } from "next";
import { BLOG_CATEGORIES } from "./blog/categories";
import { BLOG_POSTS } from "./blog/posts";
import { getAuthorIndex, getPostsByAuthor, getPostsByCategory } from "./blog/utils";
import { HELP_ARTICLES } from "./help/articles";
import { LEGAL_DOCS } from "./legal/documents";
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
    if (posts.length === 0) return [];
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

  const publishedReviews = await prisma.review.findMany({
    where: { status: "published" },
    select: { id: true, updatedAt: true },
  });
  const reviewEntries: MetadataRoute.Sitemap = publishedReviews.map((r) => ({
    url: `${base}/reviews/${r.id}`,
    lastModified: r.updatedAt,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  // lastModified is each document's own `updated` date rather than new Date():
  // legal text changes rarely, and an always-now timestamp is exactly the
  // signal crawlers learn to discount.
  const legalEntries: MetadataRoute.Sitemap = LEGAL_DOCS.map((doc) => ({
    url: `${base}${doc.slug}`,
    lastModified: doc.updated,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  const helpEntries: MetadataRoute.Sitemap = HELP_ARTICLES.map((a) => ({
    url: `${base}/help/${a.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...categoryEntries,
    ...authorEntries,
    ...blogEntries,
    { url: `${base}/reviews`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    ...reviewEntries,
    { url: `${base}/help`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    ...helpEntries,
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/affiliate-program`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/legal`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    ...legalEntries,
  ];
}
