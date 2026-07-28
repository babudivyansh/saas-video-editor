import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./posts";
import type { BlogBlock, BlogPost } from "./types";
import { getPostsByCategory, getReadingTime, getRelatedPosts, getTocItems, withMidArticleCta } from "./utils";

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    slug: "test-post",
    category: "Guide",
    title: "Test",
    metaDescription: "d",
    intro: "",
    publishedAt: "2025-01-01",
    updatedAt: "2025-01-01",
    author: { slug: "clipiro-team", name: "Clipiro Team", role: "Editorial" },
    body: [],
    faqs: [],
    closing: "",
    ...overrides,
  };
}

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("getReadingTime", () => {
  it("counts callout text as prose", () => {
    const withoutCallout = makePost({ body: [{ text: words(225) }] });
    const withCallout = makePost({
      body: [{ text: words(225) }, { type: "callout", tone: "tip", text: words(225) }],
    });
    expect(getReadingTime(withoutCallout)).toBe("1 min read");
    expect(getReadingTime(withCallout)).toBe("2 min read");
  });

  it("scores a CTA block as zero — it is an action, not reading", () => {
    const withCta = makePost({
      body: [{ text: words(225) }, { type: "cta", heading: words(50), body: words(50) }],
    });
    expect(getReadingTime(withCta)).toBe("1 min read");
  });

  it("counts an image's caption but not its alt text", () => {
    const post = makePost({
      body: [
        { text: words(225) },
        { type: "image", image: { src: "/x.webp", alt: words(100), width: 1, height: 1, caption: words(225) } },
      ],
    });
    expect(getReadingTime(post)).toBe("2 min read");
  });

  it("never reports less than a minute", () => {
    expect(getReadingTime(makePost({ body: [{ text: "hi" }] }))).toBe("1 min read");
  });
});

describe("withMidArticleCta", () => {
  const section = (heading: string): BlogBlock => ({ heading, text: words(100) });
  const para = (): BlogBlock => ({ text: words(100) });

  it("leaves the body untouched when the author placed a CTA explicitly", () => {
    const body: BlogBlock[] = [section("A"), para(), { type: "cta" }, section("B"), para()];
    expect(withMidArticleCta(body)).toBe(body);
  });

  it("inserts exactly one CTA at a section boundary", () => {
    const body: BlogBlock[] = [section("A"), para(), section("B"), para(), section("C"), para()];
    const result = withMidArticleCta(body);

    expect(result.filter((b) => b.type === "cta")).toHaveLength(1);
    const at = result.findIndex((b) => b.type === "cta");
    // The block immediately after the CTA must open a new section, which is
    // the whole point: a CTA must never split a section's prose.
    const next = result[at + 1];
    expect(next.type === undefined && next.heading).toBeTruthy();
  });

  it("bails out when there are too few section boundaries to place it well", () => {
    const body: BlogBlock[] = [section("A"), para(), para()];
    expect(withMidArticleCta(body)).toBe(body);
  });

  // Regression guard for the smarter-clip-detection shape, where every
  // paragraph opens its own section — a purely positional rule is wrong there
  // by construction.
  it("still places a single CTA when every block is a heading", () => {
    const body: BlogBlock[] = Array.from({ length: 7 }, (_, i) => section(`H${i}`));
    const result = withMidArticleCta(body);
    expect(result.filter((b) => b.type === "cta")).toHaveLength(1);
    expect(result[0].type).toBeUndefined();
    expect(result[result.length - 1].type).toBeUndefined();
  });

  it("never appends the CTA as the final block", () => {
    const body: BlogBlock[] = [section("A"), para(), section("B"), para(), section("C"), para()];
    const result = withMidArticleCta(body);
    expect(result[result.length - 1].type).not.toBe("cta");
  });

  it("is a no-op on an empty body", () => {
    expect(withMidArticleCta([])).toEqual([]);
  });
});

describe("getTocItems", () => {
  it("lists every H2 in document order", () => {
    const post = makePost({
      body: [
        { heading: "First", text: "a" },
        { text: "b" },
        { heading: "Second", text: "c" },
      ],
    });
    expect(getTocItems(post)).toEqual([
      { id: "first", text: "First" },
      { id: "second", text: "Second" },
    ]);
  });

  it("ignores non-paragraph blocks", () => {
    const post = makePost({
      body: [
        { heading: "Real", text: "a" },
        { type: "callout", tone: "tip", title: "Not a heading", text: "b" },
        { type: "cta", heading: "Also not a heading" },
      ],
    });
    expect(getTocItems(post)).toEqual([{ id: "real", text: "Real" }]);
  });

  it("disambiguates duplicate headings so no two anchors collide", () => {
    const post = makePost({
      body: [
        { heading: "Recap", text: "a" },
        { heading: "Recap", text: "b" },
      ],
    });
    expect(getTocItems(post).map((t) => t.id)).toEqual(["recap", "recap-2"]);
  });

  it("returns empty for a post with no headings", () => {
    expect(getTocItems(makePost({ body: [{ text: "just prose" }] }))).toEqual([]);
  });

  it("produces a unique id per heading across every real post", () => {
    for (const post of BLOG_POSTS) {
      const ids = getTocItems(post).map((t) => t.id);
      expect(new Set(ids).size, `${post.slug} has colliding anchor ids`).toBe(ids.length);
    }
  });

  // The renderer walks withMidArticleCta(post.body) while the TOC comes from
  // post.body — an injected CTA must not shift heading/anchor alignment.
  it("stays aligned with the rendered body after CTA injection", () => {
    for (const post of BLOG_POSTS) {
      const toc = getTocItems(post);
      const renderedHeadings = withMidArticleCta(post.body)
        .filter((b) => b.type === undefined && b.heading)
        .map((b) => (b as { heading: string }).heading);
      expect(renderedHeadings).toEqual(toc.map((t) => t.text));
    }
  });
});

describe("getPostsByCategory", () => {
  it("returns only posts in that category", () => {
    const posts = getPostsByCategory("guide", BLOG_POSTS);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.category === "Guide")).toBe(true);
  });

  it("returns empty for an unknown slug rather than throwing", () => {
    expect(getPostsByCategory("nope", BLOG_POSTS)).toEqual([]);
  });
});

describe("getRelatedPosts", () => {
  it("prefers same-category posts", () => {
    const a = makePost({ slug: "a", category: "Guide" });
    const b = makePost({ slug: "b", category: "Guide", publishedAt: "2025-02-01" });
    const c = makePost({ slug: "c", category: "Growth" });
    expect(getRelatedPosts(a, [a, b, c], 1)[0].slug).toBe("b");
  });

  it("never includes the post itself", () => {
    for (const post of BLOG_POSTS) {
      expect(getRelatedPosts(post, BLOG_POSTS, 2).map((p) => p.slug)).not.toContain(post.slug);
    }
  });

  // Every post currently shares the same updatedAt, so an inconsistent
  // comparator would silently produce arbitrary ordering here.
  it("is deterministic when updatedAt ties across every post", () => {
    const first = BLOG_POSTS.map((p) => getRelatedPosts(p, BLOG_POSTS, 2).map((r) => r.slug));
    const second = BLOG_POSTS.map((p) => getRelatedPosts(p, [...BLOG_POSTS].reverse(), 2).map((r) => r.slug));
    expect(first).toEqual(second);
  });
});
