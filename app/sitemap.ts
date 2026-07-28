import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "./blog/posts";
import { HELP_ARTICLES } from "./help/articles";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://clipiro.com";

  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

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
    ...blogEntries,
    { url: `${base}/reviews`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    ...reviewEntries,
    { url: `${base}/help`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    ...helpEntries,
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/affiliate-program`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookies`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/affiliate-tos`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
