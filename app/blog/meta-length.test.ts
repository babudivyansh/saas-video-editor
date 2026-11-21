import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./posts";
import { AUTHORS } from "./authors";
import { HELP_ARTICLES } from "@/app/help/articles";

// Search results cut a <title> at ~60 characters and a description at ~160.
// The 2026-11-21 SEO audit found five blog titles and a dozen descriptions past
// those limits, each losing its brand suffix or last clause in the snippet.
const TITLE_SUFFIX = " · Clipiro"; // app/layout.tsx title.template
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

describe("search snippet lengths", () => {
  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))("blog post %s fits the snippet", (_slug, post) => {
    const title = (post.seoTitle ?? post.title) + TITLE_SUFFIX;
    expect(title.length, `title "${title}" — add a shorter seoTitle`).toBeLessThanOrEqual(MAX_TITLE);
    expect(post.metaDescription.length, "metaDescription").toBeLessThanOrEqual(MAX_DESCRIPTION);
  });

  it.each(HELP_ARTICLES.map((a) => [a.slug, a] as const))("help article %s fits the snippet", (_slug, article) => {
    expect(article.metaDescription.length, "metaDescription").toBeLessThanOrEqual(MAX_DESCRIPTION);
  });

  it("author hub descriptions fit the snippet", () => {
    for (const author of Object.values(AUTHORS)) {
      const description: string | undefined = ("metaDescription" in author ? author.metaDescription : undefined) ?? author.bio;
      if (description) expect(description.length, author.slug).toBeLessThanOrEqual(MAX_DESCRIPTION);
    }
  });
});
