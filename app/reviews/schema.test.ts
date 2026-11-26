import { describe, expect, it } from "vitest";
import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";
import {
  MINIMUM_REVIEWS_FOR_RATING,
  buildSoftwareApplicationWithReviewsSchema,
  buildStandaloneReviewSchema,
} from "./schema";

const review = {
  id: "r1",
  rating: 5,
  title: "Great",
  body: "Turned a two hour podcast into twelve shorts in minutes.",
  createdAt: "2026-11-01T00:00:00.000Z",
  author: { name: "Asha" },
} as unknown as PublicReviewDTO;

const summary = (count: number) => ({ count, average: 4.8 }) as unknown as ReviewSummary;

describe("review-snippet structured data", () => {
  it("omits the review list when there are too few reviews for an aggregateRating", () => {
    const schema = buildSoftwareApplicationWithReviewsSchema(summary(MINIMUM_REVIEWS_FOR_RATING - 1), [review, review]);
    expect(schema).not.toHaveProperty("review");
    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("emits reviews together with an aggregateRating once the threshold is met", () => {
    const schema = buildSoftwareApplicationWithReviewsSchema(summary(MINIMUM_REVIEWS_FOR_RATING), [review, review]);
    expect(schema).toHaveProperty("aggregateRating");
    expect((schema as { review: unknown[] }).review).toHaveLength(2);
  });

  it("gives a standalone review an itemReviewed", () => {
    const schema = buildStandaloneReviewSchema(review);
    expect(schema["@type"]).toBe("Review");
    expect(schema.itemReviewed).toMatchObject({ "@type": "SoftwareApplication", name: "Clipiro" });
  });
});
