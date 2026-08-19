import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildBreadcrumbSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import { Button } from "@/app/components/ui/Button";
import { ALL_TOOLS, CATEGORY_LABELS, getToolBySlug } from "@/app/components/featureLinks";
import ToolImage from "@/app/components/marketing/ToolImage";
import ToolMock from "@/app/components/marketing/ToolMock";
import { hasSecondaryMotif } from "@/app/components/marketing/toolMotifs";
import SocialProof from "@/app/components/landing/SocialProof";
import Features from "@/app/components/landing/Features";
import HowItWorks from "@/app/components/landing/HowItWorks";
import FounderSection from "@/app/components/landing/FounderSection";
import FAQ from "@/app/components/landing/FAQ";
import CTABanner from "@/app/components/landing/CTABanner";
import { getToolContent } from "../content";
import { getToolImages } from "../toolImages";

const SITE_URL = "https://clipiro.com";

export function generateStaticParams() {
  return ALL_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  const content = getToolContent(slug);
  if (!tool || !content) return { title: "Tool not found" };

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical: `/tools/${slug}` },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url: `/tools/${slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: content.metaTitle,
      description: content.metaDescription,
    },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  const content = getToolContent(slug);
  if (!tool || !content) notFound();

  const categoryLabel = CATEGORY_LABELS[tool.category];
  const isFree = tool.category === "free";
  // A designed illustration wins over the generated motif when one exists.
  const artwork = getToolImages(slug);

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `Clipiro ${tool.title}`,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description: content.metaDescription,
      url: `${SITE_URL}/tools/${slug}`,
      publisher: { "@type": "Organization", name: "Clipiro", url: SITE_URL },
      // Only tools with real artwork can fill this — schema.org needs an
      // absolute URL to a raster, which inline SVG cannot provide. Tools still
      // on a generated motif simply omit it rather than pointing at nothing.
      ...(artwork && {
        image: [artwork.primary, artwork.secondary]
          .filter((i) => i !== undefined)
          .map((i) => `${SITE_URL}${i.src}`),
      }),
      ...(isFree && {
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      }),
    },
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: tool.title, path: `/tools/${slug}` },
    ]),
  ];

  return (
    <MarketingShell>
      <JsonLd data={schema} />

      <PageHero
        // Both claims are already made on /pricing, so neither is a new
        // assertion we would have to stand behind.
        badge={isFree ? "Free — no card required" : "48-hour money-back guarantee"}
        eyebrow={categoryLabel}
        title={content.h1}
        lede={content.lede}
        sideMedia={artwork ? <ToolImage {...artwork.primary} priority /> : undefined}
        media={
          artwork ? (
            artwork.secondary && (
              <div className="mx-auto max-w-[1100px]">
                <ToolImage {...artwork.secondary} />
              </div>
            )
          ) : (
            <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
              <ToolMock slug={slug} label={tool.title} />
              {hasSecondaryMotif(slug) && <ToolMock slug={slug} variant="secondary" label={tool.title} />}
            </div>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button href={tool.href} size="lg">
            {isFree ? `Use ${tool.title} free` : `Try ${tool.title}`}
          </Button>
          <Button href="/pricing" variant="secondary" size="lg">
            See pricing
          </Button>
        </div>
        {isFree && (
          <p className="text-[13px] text-ink-soft">Free on every plan — no credits, no watermark.</p>
        )}
      </PageHero>

      {/* Below the hero artwork, every tool page reuses the homepage's
          product story instead of a bespoke steps/benefits/FAQ stack — one
          pitch to maintain instead of 22. */}
      <SocialProof />
      <Features />
      <HowItWorks />
      <FounderSection />
      <FAQ />
      <CTABanner />
    </MarketingShell>
  );
}
