import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";

const SITE_URL = "https://clipiro.com";

// Below this many published reviews the homepage shows no testimonial wall —
// a sparse grid reads worse than none.
export const MINIMUM_REVIEWS_FOR_SCHEMA = 3;

// A star average is a stronger claim than a few quotes, so it waits for a
// bigger sample: this gates the AggregateRating JSON-LD (homepage and
// /reviews) and the hero's "5.0 · N reviews" badge. A perfect 5.0 from five
// reviews reads as manufactured to visitors and to Google's review-snippet
// policy alike (2026-11 SEO audit); raised from 3.
export const MINIMUM_REVIEWS_FOR_RATING = 10;

export function buildAggregateRatingSchema(summary: ReviewSummary) {
  if (summary.count < MINIMUM_REVIEWS_FOR_RATING) return null;
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
