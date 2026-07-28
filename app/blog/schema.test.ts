import { describe, expect, it } from "vitest";
import { buildBlogPostingSchema, buildCollectionPageSchema, buildProfilePageSchema } from "./schema";
import type { BlogPost } from "./types";

const base: BlogPost = {
  slug: "test-post",
  category: "Guide",
  title: "Test",
  metaDescription: "d",
  intro: "",
  publishedAt: "2025-01-01",
  updatedAt: "2025-02-01",
  author: { slug: "clipiro-team", name: "Clipiro Team", role: "Editorial" },
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

  /**
   * Claiming a schema.org Person for a name that isn't a real individual is a
   * worse E-E-A-T signal than an honest Organization, so Organization is the
   * default and Person must be opted into explicitly.
   */
  it("defaults the author to Organization pointing at the site", () => {
    expect(buildBlogPostingSchema(base).author).toEqual({
      "@type": "Organization",
      name: "Clipiro Team",
      url: "https://clipiro.com",
    });
  });

  it("emits Person with the author hub URL only when the byline is a real individual", () => {
    const schema = buildBlogPostingSchema({
      ...base,
      author: { slug: "jane-doe", name: "Jane Doe", role: "Editorial", kind: "Person" },
    });
    expect(schema.author).toEqual({
      "@type": "Person",
      name: "Jane Doe",
      url: "https://clipiro.com/blog/author/jane-doe",
    });
  });
});

describe("buildProfilePageSchema", () => {
  it("describes the author and lists their posts", () => {
    const schema = buildProfilePageSchema(base.author, [base]);
    expect(schema["@type"]).toBe("ProfilePage");
    expect(schema.mainEntity).toMatchObject({
      "@type": "Organization",
      name: "Clipiro Team",
      url: "https://clipiro.com/blog/author/clipiro-team",
    });
    expect(schema.hasPart).toEqual([
      { "@type": "BlogPosting", headline: "Test", url: "https://clipiro.com/blog/test-post", datePublished: "2025-01-01" },
    ]);
  });

  it("omits description and sameAs when there's nothing to say", () => {
    const schema = buildProfilePageSchema(base.author, []);
    expect(schema.mainEntity).not.toHaveProperty("description");
    expect(schema.mainEntity).not.toHaveProperty("sameAs");
  });

  it("includes bio and links when present", () => {
    const schema = buildProfilePageSchema(
      { ...base.author, bio: "We build Clipiro.", links: [{ label: "X", href: "https://x.com/clipiro" }] },
      [],
    );
    expect(schema.mainEntity).toMatchObject({
      description: "We build Clipiro.",
      sameAs: ["https://x.com/clipiro"],
    });
  });
});
