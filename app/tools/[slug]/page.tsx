import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import CardGrid from "@/app/components/marketing/CardGrid";
import LinkCard from "@/app/components/marketing/LinkCard";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { CONTAINER } from "@/app/components/marketing/styles";
import { Button } from "@/app/components/ui/Button";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import {
  ALL_TOOLS,
  CATEGORY_LABELS,
  TOOLS_BY_CATEGORY,
  getToolBySlug,
  toolPath,
} from "@/app/components/featureLinks";
import { getToolContent } from "../content";

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
  const related = TOOLS_BY_CATEGORY[tool.category].filter((t) => t.slug !== tool.slug).slice(0, 3);
  const isFree = tool.category === "free";

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
      ...(isFree && {
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      }),
    },
    buildFaqPageSchema(content.faqs),
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
        eyebrow={categoryLabel}
        title={content.h1}
        lede={content.lede}
        above={
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
              <li>
                <Link href="/" className="transition-colors hover:text-brand">
                  Home
                </Link>
              </li>
              <li aria-hidden="true" className="text-card-border">
                /
              </li>
              <li>
                <Link href="/tools" className="transition-colors hover:text-brand">
                  Tools
                </Link>
              </li>
              <li aria-hidden="true" className="text-card-border">
                /
              </li>
              <li>
                <span aria-current="page" className="font-medium text-brand">
                  {tool.title}
                </span>
              </li>
            </ol>
          </nav>
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

      <Section eyebrow="How it works" title="Three steps, start to finish">
        <ol className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
          {content.steps.map((step, i) => (
            <li
              key={step.title}
              className="flex h-full flex-col rounded-2xl border border-card-border bg-white p-6"
            >
              <span className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full grad-brand text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">{step.title}</h3>
              <p className="text-[14px] leading-[1.6] text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        className="border-t border-card-border bg-surface"
        eyebrow="Why creators use it"
        title={`What ${tool.title} gives you`}
      >
        <ul className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
          {content.benefits.map((benefit) => (
            <li key={benefit.title} className="flex h-full flex-col rounded-2xl border border-card-border bg-white p-6">
              <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">{benefit.title}</h3>
              <p className="text-[14px] leading-[1.6] text-ink-soft">{benefit.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {related.length > 0 && (
        <Section
          className="border-t border-card-border"
          eyebrow="More in this category"
          // Not lowercased — that turns "AI Tools" into "ai tools".
          title={`More ${categoryLabel}`}
        >
          <CardGrid>
            {related.map((item) => (
              <LinkCard
                key={item.slug}
                href={toolPath(item)}
                title={item.title}
                description={item.desc}
                cta="Learn more"
              />
            ))}
          </CardGrid>
        </Section>
      )}

      <Section className="border-t border-card-border bg-surface" eyebrow="FAQs" title="Frequently asked questions">
        <div className="max-w-[760px]">
          <FaqAccordion items={content.faqs} />
        </div>
      </Section>

      <section className="border-t border-card-border">
        <div className={`${CONTAINER} py-16 md:py-20`}>
          <div className="grad-hero flex flex-col items-start gap-5 rounded-[var(--radius-card)] p-8 md:p-12">
            <h2 className="max-w-[560px] text-[26px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[32px]">
              Start with {tool.title} — the other {ALL_TOOLS.length - 1} tools come with it.
            </h2>
            <p className="max-w-[520px] text-[15px] leading-[1.6] text-ink-soft">
              One plan, one credit balance, every tool in the workspace. Start free, no card required.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button href={tool.href} size="lg">
                Get started free
              </Button>
              <Button href="/tools" variant="secondary" size="lg">
                Browse all tools
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
