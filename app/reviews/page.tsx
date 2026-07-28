import type { Metadata } from "next";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { Button } from "@/app/components/ui/Button";
import { ReviewsPageClient } from "@/app/components/reviews/ReviewsPageClient";
import { getReviewSummary, listPublishedReviews } from "@/lib/reviews/queries";
import { REVIEWS_FAQS } from "@/app/reviews/faqs";
import { buildSoftwareApplicationWithReviewsSchema, buildReviewsFaqSchema } from "@/app/reviews/schema";
import { buildBreadcrumbSchema } from "@/app/blog/schema";

// Ratings don't need to be real-time — an hourly refresh keeps SEO data
// (and first paint) real without hitting Postgres on every request.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Reviews",
  description: "See what creators are saying about Clipiro — real, verified reviews from people turning long videos into viral clips.",
  alternates: { canonical: "/reviews" },
  openGraph: {
    title: "Clipiro Reviews",
    description: "Real, verified reviews from Clipiro creators.",
  },
};

export default async function ReviewsPage() {
  const [summary, { items, nextCursor }] = await Promise.all([
    getReviewSummary(),
    listPublishedReviews({ sort: "recent", limit: 20 }),
  ]);

  const topReviews = items.slice(0, 10);
  const softwareAppSchema = buildSoftwareApplicationWithReviewsSchema(summary, topReviews);
  const faqSchema = buildReviewsFaqSchema(REVIEWS_FAQS);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Reviews", path: "/reviews" },
  ]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <SiteNavbar solid />
      <main>
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-16 text-center md:px-12 lg:px-[120px]">
            <div className="flex justify-center">
              <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reviews" }]} />
            </div>
            <span className="mt-4 block text-xs font-bold uppercase tracking-widest text-brand">Reviews</span>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-gray-900 md:text-6xl">
              What creators say about Clipiro
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
              Real, verified reviews from people using Clipiro to turn long videos into viral clips.
            </p>
            <div className="mt-6">
              <Button href="/dashboard?prompt=1" variant="primary" size="lg">Write a review</Button>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-screen-2xl px-4 py-14 md:px-12 lg:px-[120px]">
          <ReviewsPageClient initialItems={items} initialSummary={summary} initialNextCursor={nextCursor} />
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 py-16 md:px-12">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {REVIEWS_FAQS.map((faq) => (
              <div key={faq.question} className="bg-white border border-gray-100 rounded-xl p-6">
                <p className="font-semibold text-gray-900 text-sm">{faq.question}</p>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
