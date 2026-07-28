import { describe, expect, it } from "vitest";
import { AUTHORS } from "./authors";
import { BLOG_POSTS } from "./posts";
import { getAuthorIndex, getPostsByAuthor } from "./utils";

describe("AUTHORS", () => {
  it("gives every byline a URL-safe slug", () => {
    for (const author of Object.values(AUTHORS)) {
      expect(author.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every byline a name and a role", () => {
    for (const author of Object.values(AUTHORS)) {
      expect(author.name.length).toBeGreaterThan(0);
      expect(author.role.length).toBeGreaterThan(0);
    }
  });

  /**
   * The thin-content guard. All three bylines are the same entity in different
   * roles; if they ever get distinct slugs, this suite fails and forces the
   * question of whether three near-identical author pages are really intended.
   */
  it("keeps same-named bylines on one slug so they collapse to one hub page", () => {
    const byName = new Map<string, Set<string>>();
    for (const author of Object.values(AUTHORS)) {
      if (!byName.has(author.name)) byName.set(author.name, new Set());
      byName.get(author.name)!.add(author.slug);
    }
    for (const [name, slugs] of byName) {
      expect(slugs.size, `"${name}" is split across ${slugs.size} author pages`).toBe(1);
    }
  });
});

describe("getAuthorIndex", () => {
  it("resolves every published post's author", () => {
    const index = getAuthorIndex(BLOG_POSTS);
    for (const post of BLOG_POSTS) {
      expect(index.get(post.author.slug)).toBeDefined();
    }
  });

  it("yields exactly one entry for the shared Clipiro Team byline", () => {
    expect(getAuthorIndex(BLOG_POSTS).size).toBe(1);
  });

  // Deriving the index from posts (not from AUTHORS) is what prevents an
  // unused byline from generating an empty, indexable page.
  it("excludes authors with no published posts", () => {
    expect(getAuthorIndex([]).size).toBe(0);
  });
});

describe("getPostsByAuthor", () => {
  it("returns every post for the shared byline", () => {
    expect(getPostsByAuthor("clipiro-team", BLOG_POSTS)).toHaveLength(BLOG_POSTS.length);
  });

  it("returns empty for an unknown slug rather than throwing", () => {
    expect(getPostsByAuthor("nobody", BLOG_POSTS)).toEqual([]);
  });

  it("is deterministic despite every post sharing an updatedAt", () => {
    const a = getPostsByAuthor("clipiro-team", BLOG_POSTS).map((p) => p.slug);
    const b = getPostsByAuthor("clipiro-team", [...BLOG_POSTS].reverse()).map((p) => p.slug);
    expect(a).toEqual(b);
  });
});
