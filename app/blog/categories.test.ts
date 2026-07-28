import { describe, expect, it } from "vitest";
import { BLOG_CATEGORIES, getCategoryByLabel, getCategoryBySlug } from "./categories";
import { BLOG_POSTS } from "./posts";

describe("BLOG_CATEGORIES", () => {
  it("has unique, URL-safe slugs", () => {
    const slugs = BLOG_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("has unique labels", () => {
    const labels = BLOG_CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every category a non-empty blurb for its meta description", () => {
    for (const category of BLOG_CATEGORIES) {
      expect(category.blurb.length).toBeGreaterThan(20);
    }
  });

  // The type system already enforces this at compile time, but only for posts
  // that exist now — this catches a category being deleted out from under a
  // post at runtime.
  it("resolves the category of every published post", () => {
    for (const post of BLOG_POSTS) {
      expect(getCategoryByLabel(post.category)).toBeDefined();
    }
  });
});

describe("getCategoryBySlug", () => {
  it("resolves a known slug", () => {
    expect(getCategoryBySlug("multi-language")?.label).toBe("Multi-language");
  });

  it("returns undefined for an unknown slug so the caller can 404", () => {
    expect(getCategoryBySlug("nope")).toBeUndefined();
  });

  it("does not match on label casing", () => {
    expect(getCategoryBySlug("Guide")).toBeUndefined();
  });
});
