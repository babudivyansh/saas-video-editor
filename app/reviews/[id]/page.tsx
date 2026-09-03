import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";
import { JsonLd } from "@/app/components/JsonLd";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { ReviewCard } from "@/app/components/reviews/ReviewCard";
import { getPublishedReviewById } from "@/lib/reviews/queries";
import { buildReviewSchema } from "@/app/reviews/schema";
import { buildBreadcrumbSchema } from "@/app/blog/schema";
import { featureUsedLabel } from "@/lib/reviews/constants";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const review = await getPublishedReviewById(id);
  if (!review) return { title: "Review not found" };

  const title = review.title || `${review.author.name}'s review of Clipiro`;
  const description = review.body.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/reviews/${id}` },
    openGraph: { title, description },
  };
}

export default async function ReviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  const review = await getPublishedReviewById(id);
  if (!review) notFound();

  const reviewSchema = { "@context": "https://schema.org", ...buildReviewSchema(review) };
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Reviews", path: "/reviews" },
    { name: review.title || featureUsedLabel(review.featureUsed), path: `/reviews/${id}` },
  ]);

  return (
    <div className="min-h-screen bg-bg text-fg font-sans">
      <JsonLd data={reviewSchema} />
      <JsonLd data={breadcrumbSchema} />
      <SiteNavbar solid />
      <main>
        <section className="mx-auto w-full max-w-2xl px-4 py-14 md:px-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Reviews", href: "/reviews" }, { label: review.title || "Review" }]} />
          <div className="mt-8">
            <ReviewCard review={review} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
