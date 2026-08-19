import type { Metadata } from "next";
import Link from "next/link";
import CardGrid from "@/app/components/marketing/CardGrid";
import LinkCard from "@/app/components/marketing/LinkCard";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { CONTAINER } from "@/app/components/marketing/styles";
import { Button } from "@/app/components/ui/Button";
import { HELP_ARTICLES, HELP_CATEGORIES } from "./articles";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides for getting started with Clipiro, credits and billing, Auto Clips, the editor, and account security.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  const populated = HELP_CATEGORIES.map((cat) => ({
    cat,
    articles: HELP_ARTICLES.filter((a) => a.category === cat),
  })).filter((group) => group.articles.length > 0);

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Help Center"
        title="How can we help?"
        lede={
          <>
            Short, practical guides to every part of Clipiro. Can&apos;t find it?{" "}
            <Link
              href="/contact"
              className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] hover:decoration-brand"
            >
              Contact us
            </Link>
            .
          </>
        }
      />

      {populated.map((group, i) => (
        <Section
          key={group.cat}
          eyebrow={`${group.articles.length} articles`}
          title={group.cat}
          className={i === 0 ? "" : `border-t border-card-border ${i % 2 === 1 ? "bg-surface" : ""}`}
        >
          <CardGrid>
            {group.articles.map((a) => (
              <LinkCard
                key={a.slug}
                href={`/help/${a.slug}`}
                title={a.title}
                description={a.summary}
                cta="Read guide"
              />
            ))}
          </CardGrid>
        </Section>
      ))}

      <section className="border-t border-card-border">
        <div className={`${CONTAINER} py-16 md:py-20`}>
          {/* White on the filled panel — see the matching CTA on the tool
              pages for why ink/ink-soft and a brand-blue button don't work
              here. */}
          <div className="grad-hero flex flex-col items-start gap-5 rounded-[var(--radius-card)] p-8 md:p-12">
            <h2 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[32px]">
              Still stuck?
            </h2>
            <p className="max-w-[480px] text-[15px] leading-[1.6] text-white">
              We answer every message — usually within a day.
            </p>
            <Button href="/contact" variant="inverse" size="lg">
              Contact support
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
