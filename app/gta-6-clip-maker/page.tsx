import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import ToolImage from "@/app/components/marketing/ToolImage";
import { Button } from "@/app/components/ui/Button";
import FaqAccordion from "@/app/components/ui/FaqAccordion";
import SocialProof from "@/app/components/landing/SocialProof";
import CTABanner from "@/app/components/landing/CTABanner";
import { getToolImages } from "@/app/tools/toolImages";
import { GAMING_CAPTION_FAMILIES, GTA6_CONTENT as content, NOT_AFFILIATED, ROCKSTAR_POLICY_URL } from "./content";

// A use-case page, not a tool page: AutoClip is the tool, this is who it is
// for right now. It lives outside /tools/[slug] because ALL_TOOLS is also the
// dashboard's tool list, and this would show up there as a tool that isn't one.

const SITE_URL = "https://clipiro.com";
const PATH = "/gta-6-clip-maker";
const AUTOCLIP_HREF = "/dashboard/create/auto-clip";

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  alternates: { canonical: PATH },
  openGraph: { title: content.metaTitle, description: content.metaDescription, url: PATH, type: "website" },
  twitter: { card: "summary_large_image", title: content.metaTitle, description: content.metaDescription },
};

export default function Gta6ClipMakerPage() {
  // AutoClip's own artwork. No game art: Rockstar's policy bars using the
  // game's material to promote a product, and the page must not look official.
  const artwork = getToolImages("auto-clip");

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Clipiro AutoClip",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description: content.metaDescription,
      url: `${SITE_URL}${PATH}`,
      dateModified: content.updatedAt,
      publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Clipiro", url: SITE_URL },
      ...(artwork && { image: [`${SITE_URL}${artwork.primary.src}`] }),
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: content.h1,
      description: content.lede,
      step: content.steps.map((step, i) => ({ "@type": "HowToStep", position: i + 1, name: step.title, text: step.body })),
    },
    buildFaqPageSchema(content.faqs),
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "GTA 6 clip maker", path: PATH },
    ]),
  ];

  return (
    <MarketingShell>
      <JsonLd data={schema} />

      <PageHero
        badge="3-day money-back guarantee"
        eyebrow="For GTA 6 streamers"
        title={content.h1}
        lede={content.lede}
        sideMedia={artwork ? <ToolImage {...artwork.primary} priority /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button href={AUTOCLIP_HREF} size="lg">
            Clip my stream
          </Button>
          <Button href="/pricing" variant="secondary" size="lg">
            See pricing
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft">Free plan included, no card required.</p>
        <p className="text-[12px] text-ink-soft">
          Updated{" "}
          <time dateTime={content.updatedAt}>
            {new Date(`${content.updatedAt}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
          </time>
        </p>
      </PageHero>

      <Section eyebrow="How it works" title="From VOD to clips in three steps">
        <ol className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
          {content.steps.map((step, i) => (
            <li key={step.title} className="flex h-full flex-col rounded-2xl border border-card-border bg-panel p-6">
              <span className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-on-primary">
                {i + 1}
              </span>
              <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">{step.title}</h3>
              <p className="text-[14px] leading-[1.6] text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section className="border-t border-card-border" eyebrow="Built for streams" title="What you get">
        <ul className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
          {content.benefits.map((benefit) => (
            <li key={benefit.title} className="flex h-full flex-col rounded-2xl border border-card-border bg-panel p-6">
              <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">{benefit.title}</h3>
              <p className="text-[14px] leading-[1.6] text-ink-soft">{benefit.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14px] text-ink-soft">
          Browse the gaming caption styles:{" "}
          {GAMING_CAPTION_FAMILIES.map((f, i) => (
            <span key={f.id}>
              {i > 0 && " · "}
              <Link href={`/caption-templates/${f.id}`} className="font-semibold text-brand hover:underline">
                {f.name}
              </Link>
            </span>
          ))}
        </p>
      </Section>

      <Section className="border-t border-card-border" eyebrow="Before you start" title="What works best">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-card-border bg-panel p-6">
            <h3 className="mb-3 text-[17px] font-semibold tracking-tight text-ink">Works well</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-ink-soft">
              {content.bestFor.works.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-card-border bg-panel p-6">
            <h3 className="mb-3 text-[17px] font-semibold tracking-tight text-ink">Not a good fit</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-ink-soft">
              {content.bestFor.doesNotWork.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 max-w-[760px] text-[14px] leading-[1.6] text-ink-soft">
          Before posting game footage, read Rockstar&apos;s{" "}
          <a href={ROCKSTAR_POLICY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            policy on posting copyrighted Rockstar Games material
          </a>
          . What you post, and whether you can earn from it, is between you and them.
        </p>
      </Section>

      <SocialProof />

      <Section className="border-t border-card-border" eyebrow="FAQs" title="GTA 6 clipping questions">
        <div className="max-w-[760px]">
          <FaqAccordion items={content.faqs} />
        </div>
        <p className="mt-8 max-w-[760px] text-[13px] text-ink-soft">
          Also read: <Link href="/blog/how-to-clip-gta-6-streams" className="font-semibold text-brand hover:underline">How to clip GTA 6 streams into Shorts and Reels</Link>
        </p>
      </Section>

      <CTABanner />

      <p className="mx-auto max-w-[1100px] px-4 pb-10 text-center text-[12px] leading-[1.6] text-ink-soft">{NOT_AFFILIATED}</p>
    </MarketingShell>
  );
}
