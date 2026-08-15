import type { Metadata } from "next";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "@/app/blog/schema";
import { formatDate } from "@/app/blog/utils";
import CardGrid from "@/app/components/marketing/CardGrid";
import LinkCard from "@/app/components/marketing/LinkCard";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { JsonLd } from "@/app/components/JsonLd";
import { LEGAL_DOCS } from "./documents";

const DESCRIPTION = "Everything that governs your use of Clipiro — the rules, how we handle your data, and how billing works.";

export const metadata: Metadata = {
  title: "Legal",
  description: DESCRIPTION,
  alternates: { canonical: "/legal" },
};

export default function LegalHubPage() {
  const schema = [
    buildCollectionPageSchema({ name: "Legal documents", description: DESCRIPTION, path: "/legal" }),
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Legal", path: "/legal" },
    ]),
  ];

  return (
    <MarketingShell>
      <JsonLd data={schema} />

      <PageHero
        eyebrow="Legal"
        eyebrowIcon={
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M8 13h8M8 17h5" />
          </svg>
        }
        title="Legal documents"
        lede={
          <>
            {DESCRIPTION} Questions? Email{" "}
            <a
              href="mailto:support@clipiro.com"
              className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] hover:decoration-brand"
            >
              support@clipiro.com
            </a>
            .
          </>
        }
      />

      <Section>
        <CardGrid>
          {LEGAL_DOCS.map((doc) => (
            <LinkCard
              key={doc.slug}
              href={doc.slug}
              title={doc.title}
              description={doc.description}
              meta={`Effective ${formatDate(doc.effective)}`}
              cta="Read document"
            />
          ))}
        </CardGrid>
      </Section>
    </MarketingShell>
  );
}
