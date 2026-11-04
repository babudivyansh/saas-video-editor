import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { buildBreadcrumbSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { Button } from "@/app/components/ui/Button";
import { socialMetadata } from "@/lib/seo/social";
import TemplateCard from "../TemplateCard";

const SITE_URL = "https://clipiro.com";

function getFamily(id: string) {
  const family = CAPTION_FAMILIES.find((f) => f.id === id);
  if (!family) return undefined;
  return { ...family, templates: CAPTION_TEMPLATES.filter((t) => t.family === family.id) };
}

export function generateStaticParams() {
  return CAPTION_FAMILIES.filter((f) => CAPTION_TEMPLATES.some((t) => t.family === f.id)).map((f) => ({ family: f.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ family: string }> }): Promise<Metadata> {
  const { family: id } = await params;
  const family = getFamily(id);
  if (!family || family.templates.length === 0) return { title: "Templates not found" };
  const title = `${family.name} caption templates`;
  const description = `${family.templates.length} ${family.name} caption templates for Shorts and Reels. ${family.description}`.slice(0, 160);
  const path = `/caption-templates/${family.id}`;
  return { title, description, alternates: { canonical: path }, ...socialMetadata({ title, description, path }) };
}

export default async function CaptionFamilyPage({ params }: { params: Promise<{ family: string }> }) {
  const { family: id } = await params;
  const family = getFamily(id);
  if (!family || family.templates.length === 0) notFound();

  const path = `/caption-templates/${family.id}`;
  const others = CAPTION_FAMILIES.filter((f) => f.id !== family.id && CAPTION_TEMPLATES.some((t) => t.family === f.id));

  return (
    <MarketingShell>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${family.name} caption templates`,
            url: `${SITE_URL}${path}`,
            numberOfItems: family.templates.length,
            itemListElement: family.templates.map((t, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t.name,
              description: t.hint,
            })),
          },
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Caption templates", path: "/caption-templates" },
            { name: family.name, path },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Caption templates"
        title={`${family.name} caption templates`}
        lede={`${family.description} ${family.templates.length} templates, each previewed live below exactly as it renders in the export.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button href="/tools/caption-studio" size="lg">
            Use these in Caption Studio
          </Button>
          <Button href="/caption-templates" variant="secondary" size="lg">
            All templates
          </Button>
        </div>
      </PageHero>

      <Section eyebrow={`${family.templates.length} templates`} title={`Every ${family.name} template`}>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {family.templates.map((t) => (
            <TemplateCard key={t.id} template={t} detailed />
          ))}
        </ul>
      </Section>

      <Section className="border-t border-card-border" eyebrow="More styles" title="Other caption families">
        <ul className="flex flex-wrap gap-2">
          {others.map((f) => (
            <li key={f.id}>
              <Link
                href={`/caption-templates/${f.id}`}
                className="inline-block rounded-full border border-card-border px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:border-brand/50 hover:text-ink"
              >
                {f.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </MarketingShell>
  );
}
