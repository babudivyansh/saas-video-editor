import type { Metadata } from "next";
import Link from "next/link";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { Button } from "@/app/components/ui/Button";
import { socialMetadata } from "@/lib/seo/social";
import TemplateCard from "./TemplateCard";

// The public, indexable caption template gallery: one section per family on
// this page (a few previews each) and a page per family with every template.
// Searches like "TikTok caption styles" or "Hindi captions for Reels" want to
// see the styles, and until now they only existed inside the logged-in picker.

const COUNT = CAPTION_TEMPLATES.length;
const DESCRIPTION = `Browse all ${COUNT} Clipiro caption templates in ${CAPTION_FAMILIES.length} families, from viral bold and karaoke highlights to podcast, cinematic and Hindi styles, each shown live.`;
const PREVIEWS_PER_FAMILY = 3;

export const metadata: Metadata = {
  title: `${COUNT} caption templates for Shorts and Reels`,
  description: DESCRIPTION,
  alternates: { canonical: "/caption-templates" },
  ...socialMetadata({ title: `${COUNT} caption templates for Shorts and Reels`, description: DESCRIPTION, path: "/caption-templates" }),
};

export default function CaptionTemplatesPage() {
  const families = CAPTION_FAMILIES.map((f) => ({ ...f, templates: CAPTION_TEMPLATES.filter((t) => t.family === f.id) })).filter(
    (f) => f.templates.length > 0,
  );

  return (
    <MarketingShell>
      <JsonLd
        data={[
          buildCollectionPageSchema({ name: "Clipiro caption templates", description: DESCRIPTION, path: "/caption-templates" }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Caption templates", path: "/caption-templates" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Caption templates"
        title={`${COUNT} caption styles, every word editable`}
        lede={`Clipiro's caption library has ${COUNT} templates in ${families.length} families. Pick one in Caption Studio or AutoClip and it burns into the export exactly as previewed here, then restyle, recolour or retime any word. Free templates work on every plan; Creator and Pro templates unlock on those plans and above.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button href="/tools/caption-studio" size="lg">
            Open Caption Studio
          </Button>
          <Button href="/pricing" variant="secondary" size="lg">
            See plans
          </Button>
        </div>
      </PageHero>

      {families.map((f, i) => (
        <Section
          key={f.id}
          id={f.id}
          className={i === 0 ? "" : "border-t border-card-border"}
          eyebrow={`${f.templates.length} templates`}
          title={f.name}
          lede={f.description}
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {f.templates.slice(0, PREVIEWS_PER_FAMILY).map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </ul>
          <p className="mt-5">
            <Link href={`/caption-templates/${f.id}`} className="text-[14px] font-semibold text-brand hover:underline">
              See all {f.templates.length} {f.name} templates →
            </Link>
          </p>
        </Section>
      ))}
    </MarketingShell>
  );
}
