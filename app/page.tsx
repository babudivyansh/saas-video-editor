import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Hero from "@/app/components/landing/Hero";
import SocialProof from "@/app/components/landing/SocialProof";
import Features from "@/app/components/landing/Features";
import HowItWorks from "@/app/components/landing/HowItWorks";
import PricingPreview from "@/app/components/landing/PricingPreview";
import FounderSection from "@/app/components/landing/FounderSection";
import FAQ from "@/app/components/landing/FAQ";
import CTABanner from "@/app/components/landing/CTABanner";

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
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "12000" },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "What is Clipiro?", acceptedAnswer: { "@type": "Answer", text: "Clipiro is an AI-powered video tool that turns long videos into viral short-form clips with automatic clipping, captions, and social formatting." } },
        { "@type": "Question", name: "Is there a free plan?", acceptedAnswer: { "@type": "Answer", text: "Yes. Free tools are open to everyone and you can start creating without a credit card." } },
        { "@type": "Question", name: "Which platforms are supported?", acceptedAnswer: { "@type": "Answer", text: "Clips are optimized for TikTok, YouTube Shorts, Instagram Reels, and Facebook." } },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-h-screen bg-white text-gray-900 font-sans">
        <SiteNavbar />
        <main>
          <Hero />
          <SocialProof />
          <Features />
          <HowItWorks />
          <PricingPreview />
          <FounderSection />
          <FAQ />
          <CTABanner />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
