import { JsonLd } from "@/app/components/JsonLd";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Hero from "@/app/components/landing/Hero";
import SocialProof from "@/app/components/landing/SocialProof";
import Features from "@/app/components/landing/Features";
import ToolShowcase from "@/app/components/landing/ToolShowcase";
import HowItWorks from "@/app/components/landing/HowItWorks";
import FounderSection from "@/app/components/landing/FounderSection";
import FAQ from "@/app/components/landing/FAQ";
import CTABanner from "@/app/components/landing/CTABanner";
import TestimonialWall from "@/app/components/landing/TestimonialWall";
import { getReviewSummary, listPublishedReviews } from "@/lib/reviews/queries";
import { buildAggregateRatingSchema, MINIMUM_REVIEWS_FOR_SCHEMA } from "@/app/reviews/schema";

// Ratings are read at request time (ISR-cached) so the homepage's
// aggregateRating stays real without adding a client round-trip.
export const revalidate = 3600;

export default async function HomePage() {
  const reviewSummary = await getReviewSummary();
  const aggregateRating = buildAggregateRatingSchema(reviewSummary);

  // Testimonial wall has its own, stricter gate on top of the review-count
  // threshold above: even once there are enough reviews overall, only show
  // the wall once at least one of them is a positive, substantive quote —
  // never render a sparse or empty-looking grid.
  const testimonials =
    reviewSummary.count >= MINIMUM_REVIEWS_FOR_SCHEMA
      ? (await listPublishedReviews({ sort: "helpful", limit: 12 })).items
          .filter((r) => r.rating >= 4 && r.body.trim().length >= 40)
          .slice(0, 6)
      : [];

  // JSON-LD structured data for richer search results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Clipiro",
        url: "https://clipiro.com",
        description: "AI-powered tool that turns long videos into viral short-form clips.",
      },
      {
        "@type": "SoftwareApplication",
        name: "Clipiro",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
        ...(aggregateRating ? { aggregateRating } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is Clipiro?", acceptedAnswer: { "@type": "Answer", text: "Clipiro is an AI-powered video tool that turns long videos into viral short-form clips with automatic clipping, captions, and social formatting." } },
          { "@type": "Question", name: "Is there a free plan?", acceptedAnswer: { "@type": "Answer", text: "Yes. Free tools are open to everyone and you can start creating without a credit card." } },
          { "@type": "Question", name: "Which platforms are supported?", acceptedAnswer: { "@type": "Answer", text: "Clips are optimized for YouTube Shorts, Instagram Reels, and Facebook." } },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="flat-brand min-h-screen bg-white text-gray-900 font-sans">
        <SiteNavbar />
        <main>
          <Hero reviewSummary={reviewSummary} />
          <SocialProof />
          {testimonials.length > 0 && <TestimonialWall summary={reviewSummary} reviews={testimonials} />}
          <Features />
          <ToolShowcase />
          <HowItWorks />
          <FounderSection />
          <FAQ />
          <CTABanner />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
