import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";

const SITE_URL = "https://clipiro.com";

// Google penalizes/ignores thin, self-serving aggregate ratings — omit the
// fragment entirely below a small sample size rather than shipping a rating
// backed by 1-2 reviews.
export const MINIMUM_REVIEWS_FOR_SCHEMA = 3;

export function buildAggregateRatingSchema(summary: ReviewSummary) {
  if (summary.count < MINIMUM_REVIEWS_FOR_SCHEMA) return null;
  return {
    "@type": "AggregateRating",
    ratingValue: summary.average,
    reviewCount: summary.count,
    bestRating: 5,
    worstRating: 1,
  };
}

export function buildReviewSchema(review: PublicReviewDTO) {
  return {
    "@type": "Review",
    author: { "@type": "Person", name: review.author.name },
    reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    reviewBody: review.body,
    name: review.title ?? undefined,
    datePublished: review.createdAt,
  };
}

export function buildSoftwareApplicationWithReviewsSchema(summary: ReviewSummary, topReviews: PublicReviewDTO[]) {
  const aggregateRating = buildAggregateRatingSchema(summary);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Clipiro",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(topReviews.length > 0 ? { review: topReviews.map(buildReviewSchema) } : {}),
  };
}

export function buildReviewsFaqSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export { SITE_URL as REVIEWS_SITE_URL };
