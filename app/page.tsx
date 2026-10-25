import { JsonLd } from "@/app/components/JsonLd";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Hero from "@/app/components/landing/Hero";
import SocialProof from "@/app/components/landing/SocialProof";
import Features from "@/app/components/landing/Features";
import HowItWorks from "@/app/components/landing/HowItWorks";
import FounderSection from "@/app/components/landing/FounderSection";
import FAQ from "@/app/components/landing/FAQ";
import { HOME_FAQS } from "@/app/components/landing/faqs";
import CTABanner from "@/app/components/landing/CTABanner";
import TestimonialWall from "@/app/components/landing/TestimonialWall";
import { getReviewSummary, listPublishedReviews } from "@/lib/reviews/queries";
import { buildAggregateRatingSchema, MINIMUM_REVIEWS_FOR_SCHEMA } from "@/app/reviews/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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
        "@id": "https://clipiro.com/#organization",
        name: "Clipiro",
        url: "https://clipiro.com",
        logo: "https://clipiro.com/icon.png",
        description: "AI-powered tool that turns long videos into viral short-form clips.",
        // The same profiles SiteFooter links to — this is what lets search and
        // answer engines tie those accounts to the brand.
        sameAs: [
          "https://x.com/ClipiroOfficial",
          "https://youtube.com/@clipiroofficial",
          "https://www.instagram.com/clipiroapp/",
          "https://www.linkedin.com/company/109881774",
          "https://www.facebook.com/profile.php?id=61593101997903",
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@clipiro.com",
        },
      },
      {
        "@type": "WebSite",
        "@id": "https://clipiro.com/#website",
        name: "Clipiro",
        url: "https://clipiro.com",
        publisher: { "@id": "https://clipiro.com/#organization" },
      },
      {
        "@type": "SoftwareApplication",
        name: "Clipiro",
        url: "https://clipiro.com",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        publisher: { "@id": "https://clipiro.com/#organization" },
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
        ...(aggregateRating ? { aggregateRating } : {}),
      },
      {
        // The hero film (components/landing/Hero.tsx).
        "@type": "VideoObject",
        name: "Clipiro product film",
        description: "A tour of Clipiro: AutoClip turning a long video into captioned shorts, plus the AI tools, editor and exports.",
        thumbnailUrl: "https://clipiro.com/hero/launch-film-poster.jpg",
        contentUrl: "https://clipiro.com/hero/launch-film.mp4",
        uploadDate: "2026-10-23",
        duration: "PT1M48S",
      },
      {
        "@type": "FAQPage",
        // Built from the same array the visible FAQ renders, so the two can't drift.
        mainEntity: HOME_FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="min-h-screen bg-bg text-fg font-sans">
        <SiteNavbar />
        <main>
          <Hero reviewSummary={reviewSummary} />
          <SocialProof />
          {testimonials.length > 0 && <TestimonialWall summary={reviewSummary} reviews={testimonials} />}
          <Features />
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
