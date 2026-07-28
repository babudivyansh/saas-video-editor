import { describe, expect, it } from "vitest";
import { slugify, slugifyAll } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Why Most Podcast Clips Fail")).toBe("why-most-podcast-clips-fail");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(slugify("How many clips should one episode actually produce?")).toBe(
      "how-many-clips-should-one-episode-actually-produce",
    );
    expect(slugify("Hooks, captions & retention")).toBe("hooks-captions-retention");
  });

  // Without NFKD normalization the accented character is dropped entirely and
  // "Café" becomes "caf".
  it("folds diacritics to their base letters", () => {
    expect(slugify("Café culture")).toBe("cafe-culture");
    expect(slugify("Über den Wolken")).toBe("uber-den-wolken");
  });

  it("never leaves leading or trailing hyphens", () => {
    expect(slugify("  — Leading and trailing —  ")).toBe("leading-and-trailing");
    expect(slugify("!!!")).toBe("");
  });

  it("collapses runs of separators", () => {
    expect(slugify("a   ---   b")).toBe("a-b");
  });

  it("caps length without leaving a trailing hyphen", () => {
    const slug = slugify("a".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(60);

    // Engineered so the 60-char cut lands exactly on a separator.
    const cut = slugify(`${"a".repeat(59)} tail`);
    expect(cut.endsWith("-")).toBe(false);
  });

  it("handles non-latin scripts by falling back to empty", () => {
    expect(slugify("日本語")).toBe("");
  });
});

describe("slugifyAll", () => {
  it("leaves distinct headings untouched", () => {
    expect(slugifyAll(["First section", "Second section"])).toEqual(["first-section", "second-section"]);
  });

  /**
   * The important case. Duplicate ids mean every TOC link for the repeated
   * heading jumps to the first occurrence — a silent navigation bug.
   */
  it("disambiguates repeated headings", () => {
    expect(slugifyAll(["Recap", "Recap", "Recap"])).toEqual(["recap", "recap-2", "recap-3"]);
  });

  it("disambiguates headings that differ only by punctuation or case", () => {
    expect(slugifyAll(["The plan", "The plan!", "THE PLAN"])).toEqual(["the-plan", "the-plan-2", "the-plan-3"]);
  });

  it("gives unslugifiable headings a stable fallback instead of an empty id", () => {
    expect(slugifyAll(["!!!", "???"])).toEqual(["section", "section-2"]);
  });

  it("always returns one id per heading, all unique", () => {
    const ids = slugifyAll(["A", "A", "B", "!!!", "A", "B"]);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});
