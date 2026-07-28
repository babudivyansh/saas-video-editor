import { describe, expect, it } from "vitest";
import { buildBlogPostingSchema, buildCollectionPageSchema } from "./schema";
import type { BlogPost } from "./types";

const base: BlogPost = {
  slug: "test-post",
  category: "Guide",
  title: "Test",
  metaDescription: "d",
  intro: "",
  publishedAt: "2025-01-01",
  updatedAt: "2025-02-01",
  author: { name: "Clipiro Team", role: "Editorial" },
  body: [],
  faqs: [],
  closing: "",
};

describe("buildCollectionPageSchema", () => {
  // The /blog call site passes no arguments; parameterizing this function must
  // not have changed what that page emits.
  it("is unchanged for /blog when called with no arguments", () => {
    expect(buildCollectionPageSchema()).toEqual({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "The Clipiro creator playbook",
      description: "Tutorials, growth tips, and product updates to help you go viral with short-form video.",
      url: "https://clipiro.com/blog",
      isPartOf: { "@type": "WebSite", name: "Clipiro", url: "https://clipiro.com" },
    });
  });

  it("applies category overrides and builds an absolute url", () => {
    const schema = buildCollectionPageSchema({
      name: "Growth articles",
      description: "Publishing strategy.",
      path: "/blog/category/growth",
    });
    expect(schema.name).toBe("Growth articles");
    expect(schema.description).toBe("Publishing strategy.");
    expect(schema.url).toBe("https://clipiro.com/blog/category/growth");
  });
});

describe("buildBlogPostingSchema", () => {
  it("omits the image key entirely when the post has no hero", () => {
    expect(buildBlogPostingSchema(base)).not.toHaveProperty("image");
  });

  // schema.org requires an absolute URL here; a root-relative path is silently
  // ignored by consumers, which is the worst possible failure mode.
  it("emits an absolute image URL when the post has a hero", () => {
    const schema = buildBlogPostingSchema({
      ...base,
      hero: { src: "/blog/test-post/hero.webp", alt: "a", width: 1600, height: 900 },
    });
    expect(schema).toHaveProperty("image", ["https://clipiro.com/blog/test-post/hero.webp"]);
  });

  it("carries both publish and modify dates", () => {
    const schema = buildBlogPostingSchema(base);
    expect(schema.datePublished).toBe("2025-01-01");
    expect(schema.dateModified).toBe("2025-02-01");
  });
});
