import { describe, expect, it } from "vitest";
import { reviewExcerpt } from "@/lib/reviews/excerpt";

describe("reviewExcerpt", () => {
  it("keeps whole sentences that fit", () => {
    expect(reviewExcerpt("Great tool. Saves hours. Would recommend to anyone.", 5)).toBe("Great tool. Saves hours.");
  });

  it("returns a short body unchanged", () => {
    expect(reviewExcerpt("  Really smooth experience!  ", 10)).toBe("Really smooth experience!");
  });

  it("cuts an over-long first sentence with an ellipsis and drops a trailing comma", () => {
    expect(reviewExcerpt("It finds the best moments, cuts them, and captions everything for me", 5)).toBe(
      "It finds the best moments…",
    );
  });

  it("keeps closing quotes with their sentence", () => {
    expect(reviewExcerpt('They said "wow." Then more text follows here.', 3)).toBe('They said "wow."');
  });

  it("handles a body with no terminal punctuation", () => {
    expect(reviewExcerpt("no punctuation at all here", 10)).toBe("no punctuation at all here");
  });
});
