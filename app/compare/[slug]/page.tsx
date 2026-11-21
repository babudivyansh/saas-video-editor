import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { Button } from "@/app/components/ui/Button";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import CTABanner from "@/app/components/landing/CTABanner";
import { socialMetadata } from "@/lib/seo/social";
import CompareTable from "../CompareTable";
import { COMPETITORS, COMPETITORS_CHECKED_ON, getCompetitor } from "../data";

const SITE_URL = "https://clipiro.com";

const checkedOn = new Date(`${COMPETITORS_CHECKED_ON}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return { title: "Comparison not found" };
  const title = `${c.name} vs Clipiro`;
  const path = `/compare/${c.slug}`;
  return {
    // absolute: the layout template would append " · Clipiro" to a title that
    // already ends in Clipiro ("Vizard vs Clipiro · Clipiro").
    title: { absolute: `${title}: prices and features compared` },
    description: c.metaDescription,
    alternates: { canonical: path },
    ...socialMetadata({ title: `${title}: prices and features compared`, description: c.metaDescription, path }),
  };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  const path = `/compare/${c.slug}`;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${c.name} vs Clipiro`,
      description: c.metaDescription,
      url: `${SITE_URL}${path}`,
      dateModified: COMPETITORS_CHECKED_ON,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    buildFaqPageSchema(c.faqs),
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Compare", path: "/compare" },
      { name: `${c.name} vs Clipiro`, path },
    ]),
  ];

  return (
    <MarketingShell>
      <JsonLd data={schema} />

      <PageHero eyebrow="Compare" title={`${c.name} vs Clipiro`} lede={c.summary}>
        <div className="flex flex-wrap items-center gap-3">
          <Button href="/register" size="lg">
            Try Clipiro free
          </Button>
          <Button href="/pricing" variant="secondary" size="lg">
            See Clipiro pricing
          </Button>
        </div>
        <p className="text-[12px] text-ink-soft">
          {c.name} figures checked on <time dateTime={COMPETITORS_CHECKED_ON}>{checkedOn}</time> against{" "}
          <a href={c.pricingUrl} rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-brand">
            their pricing page
          </a>
          . Prices change; check it before you buy.
        </p>
      </PageHero>

      <Section eyebrow="Side by side" title={`${c.name} and Clipiro, feature by feature`}>
        <CompareTable
          them={c.name}
          rows={c.rows}
          caption={`${c.name}: from ${c.pricingUrl}, checked ${checkedOn}. Clipiro: from clipiro.com/pricing.`}
        />
      </Section>

      <Section className="border-t border-card-border" eyebrow="Which to pick" title="When each one fits">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-card-border bg-panel p-6">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">Pick {c.name} if…</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-[1.6] text-ink-soft">
              {c.pickThem.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand/30 bg-panel p-6">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">Pick Clipiro if…</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-[1.6] text-ink-soft">
              {c.pickUs.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-[14px] text-ink-soft">
          Other comparisons:{" "}
          {COMPETITORS.filter((o) => o.slug !== c.slug).map((o, i) => (
            <span key={o.slug}>
              {i > 0 && " · "}
              <Link href={`/compare/${o.slug}`} className="font-medium text-brand hover:underline">
                {o.name} vs Clipiro
              </Link>
            </span>
          ))}
        </p>
      </Section>

      <Section className="border-t border-card-border" eyebrow="FAQs" title={`${c.name} vs Clipiro questions`}>
        <div className="max-w-[760px]">
          <FaqAccordion items={c.faqs} />
        </div>
      </Section>

      <CTABanner />
    </MarketingShell>
  );
}
