import { describe, expect, it } from "vitest";
import { addEmojisToText, autoLineBreaks, removeFillerWords, buildAiTextPrompt, buildAiIdeasPrompt, parseAiIdeas, AI_IDEA_COUNT } from "./ai-text";

describe("addEmojisToText", () => {
  it("inserts an emoji after a recognized word", () => {
    expect(addEmojisToText("this is huge news")).toBe("this is huge 🚀 news");
  });

  it("leaves text with no recognized words unchanged", () => {
    expect(addEmojisToText("the plain brown fox")).toBe("the plain brown fox");
  });

  it("preserves original whitespace runs", () => {
    // Only "huge" gets an emoji here — planEmoji rate-limits placements to at
    // least 8 words apart, and "win" is only 1 word later.
    expect(addEmojisToText("huge  win")).toBe("huge 🚀  win");
  });

  it("rate-limits placements to at least 8 words apart, same as planEmoji", () => {
    const text = "huge one two three four five six seven win";
    expect(addEmojisToText(text)).toBe("huge 🚀 one two three four five six seven win 🏆");
  });
});

describe("autoLineBreaks", () => {
  it("wraps at the target width without splitting a word", () => {
    const out = autoLineBreaks("the quick brown fox jumps over the lazy dog", 15);
    expect(out.split("\n").every((line) => line.length <= 15)).toBe(true);
    expect(out.replace(/\n/g, " ")).toBe("the quick brown fox jumps over the lazy dog");
  });

  it("respects existing hard line breaks", () => {
    const out = autoLineBreaks("first line here\nsecond line here", 100);
    expect(out).toBe("first line here\nsecond line here");
  });

  it("returns short text unchanged", () => {
    expect(autoLineBreaks("hi there")).toBe("hi there");
  });
});

describe("removeFillerWords", () => {
  it("removes standalone filler words", () => {
    expect(removeFillerWords("so um this is like the plan")).toBe("so this is the plan");
  });

  it("removes multi-word filler phrases without leaving a stray word", () => {
    expect(removeFillerWords("it was, you know, a whole thing")).toBe("it was, a whole thing");
  });

  it("does not touch a word that only contains a filler as a substring", () => {
    expect(removeFillerWords("I like likeable people")).toBe("I likeable people");
  });

  it("leaves clean text unchanged", () => {
    expect(removeFillerWords("this plan works well")).toBe("this plan works well");
  });
});

describe("buildAiTextPrompt", () => {
  it("includes the source text for every operation", () => {
    for (const op of ["rewrite", "grammar", "readability", "shorten", "expand", "viral"] as const) {
      expect(buildAiTextPrompt(op, "the source text")).toContain("the source text");
    }
  });

  it("includes the target language for translate, defaulting to Spanish", () => {
    expect(buildAiTextPrompt("translate", "hi")).toContain("Spanish");
    expect(buildAiTextPrompt("translate", "hi", "French")).toContain("French");
  });
});

describe("parseAiIdeas", () => {
  it("strips numbering, bullets and wrapping quotes, drops blanks and duplicates", () => {
    const raw = '1. "Your mornings are broken"\n\n- Stop scrolling before 9am\n• Stop scrolling before 9am\n2) ‘I tried this for 30 days’';
    expect(parseAiIdeas(raw)).toEqual(["Your mornings are broken", "Stop scrolling before 9am", "I tried this for 30 days"]);
  });

  it(`keeps at most ${AI_IDEA_COUNT} lines`, () => {
    expect(parseAiIdeas("a\nb\nc\nd\ne\nf")).toHaveLength(AI_IDEA_COUNT);
  });
});

describe("buildAiIdeasPrompt", () => {
  it("names the kind of line and carries the brief", () => {
    const p = buildAiIdeasPrompt("titles", "3 habits that changed my mornings");
    expect(p).toContain("titles");
    expect(p).toContain("3 habits that changed my mornings");
    expect(p).toContain("one per line");
  });
});
