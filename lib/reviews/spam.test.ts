import { beforeEach, describe, expect, it, vi } from "vitest";

let reviewByBody: Map<string, { id: string; userId: string }>;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findFirst: vi.fn(async ({ where }: { where: { body: string; userId: { not: string } } }) => {
        const match = reviewByBody.get(where.body);
        return match && match.userId !== where.userId.not ? match : null;
      }),
    },
  },
}));

const { computeSpamScore, isDuplicateReviewBody } = await import("./spam");

beforeEach(() => {
  reviewByBody = new Map();
});

describe("computeSpamScore", () => {
  const ctx = { rating: 3, accountAgeHours: 1000 };

  it("scores a normal, long review as clean", () => {
    const result = computeSpamScore("This tool saved me hours of editing every week, highly recommend it.", ctx, false);
    expect(result.score).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it("flags a duplicate body", () => {
    const result = computeSpamScore("Some review text that is long enough to pass the length check easily.", ctx, true);
    expect(result.flags).toContain("duplicate_body");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("flags a body under 20 characters", () => {
    const result = computeSpamScore("too short", ctx, false);
    expect(result.flags).toContain("too_short");
  });

  it("flags a mostly-uppercase body", () => {
    const result = computeSpamScore("THIS IS AN AMAZING TOOL YOU MUST TRY IT RIGHT NOW", ctx, false);
    expect(result.flags).toContain("all_caps");
  });

  it("does not flag caps ratio for a normal mixed-case sentence", () => {
    const result = computeSpamScore("I really loved using Clipiro for my YouTube channel this month.", ctx, false);
    expect(result.flags).not.toContain("all_caps");
  });

  it("flags 2 or more raw URLs", () => {
    const result = computeSpamScore(
      "Check this out http://spam1.example.com and also http://spam2.example.com for more info please.",
      ctx,
      false,
    );
    expect(result.flags).toContain("multiple_urls");
  });

  it("does not flag a single URL", () => {
    const result = computeSpamScore(
      "You can read more about my workflow at http://example.com if you are curious about it.",
      ctx,
      false,
    );
    expect(result.flags).not.toContain("multiple_urls");
  });

  it("flags an extreme rating on a brand-new account", () => {
    const result = computeSpamScore("This is a perfectly normal length review body for testing purposes here.", { rating: 5, accountAgeHours: 2 }, false);
    expect(result.flags).toContain("new_account_extreme_rating");
  });

  it("does not flag a mid rating on a new account", () => {
    const result = computeSpamScore("This is a perfectly normal length review body for testing purposes here.", { rating: 3, accountAgeHours: 2 }, false);
    expect(result.flags).not.toContain("new_account_extreme_rating");
  });

  it("caps the combined score at 100", () => {
    const result = computeSpamScore("bad HTTP://A.COM HTTP://B.COM", { rating: 1, accountAgeHours: 1 }, true);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("isDuplicateReviewBody", () => {
  it("returns false when no other review shares the body", async () => {
    const result = await isDuplicateReviewBody("unique text", "u1");
    expect(result).toBe(false);
  });

  it("returns true when another user has the exact same body", async () => {
    reviewByBody.set("copied text", { id: "rev-2", userId: "u2" });
    const result = await isDuplicateReviewBody("copied text", "u1");
    expect(result).toBe(true);
  });

  it("returns false when the only match is the user's own review", async () => {
    reviewByBody.set("my own text", { id: "rev-1", userId: "u1" });
    const result = await isDuplicateReviewBody("my own text", "u1");
    expect(result).toBe(false);
  });
});
