import type { Metadata } from "next";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import CardGrid from "@/app/components/marketing/CardGrid";
import LinkCard from "@/app/components/marketing/LinkCard";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { socialMetadata } from "@/lib/seo/social";
import { AUTOCLIP_RERUN_FREE_WINDOW_DAYS } from "@/lib/plans/tiers";
import { COMPETITORS, clipiroCostPerMinute } from "./data";

const DESCRIPTION =
  "How Clipiro compares with Opus Clip, Vizard and 2short on price, billing currency, free plans, captions and dubbing, using each tool's own pricing page.";

export const metadata: Metadata = {
  title: "Clipiro vs other AI clipping tools",
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  ...socialMetadata({ title: "Clipiro vs other AI clipping tools", description: DESCRIPTION, path: "/compare" }),
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CompareIndexPage() {
  const perMinute = clipiroCostPerMinute();
  return (
    <MarketingShell>
      <JsonLd
        data={[
          buildCollectionPageSchema({ name: "Clipiro comparisons", description: DESCRIPTION, path: "/compare" }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Compare", path: "/compare" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="Compare"
        title="Clipiro vs other AI clipping tools"
        lede="Every AI clipper turns long videos into short vertical clips. The differences that decide which one you should pay for are the billing unit, the currency, the free plan and what else comes in the same account. These pages put those side by side, with each competitor's figures taken from its own pricing page."
      />

      <Section eyebrow="Comparisons" title="Pick a tool to compare">
        <CardGrid>
          {COMPETITORS.map((c) => (
            <LinkCard key={c.slug} href={`/compare/${c.slug}`} title={`${c.name} vs Clipiro`} description={c.summary} cta="Compare" />
          ))}
        </CardGrid>
      </Section>

      <Section
        className="border-t border-card-border"
        eyebrow="Clipiro's price per minute"
        title="What a minute of clipping costs on each Clipiro plan"
        lede={`AutoClip charges one Clip Minute per minute of source video, however many clips it makes, and re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days is free.`}
      >
        <div className="overflow-x-auto rounded-2xl border border-card-border bg-panel">
          <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
            <caption className="caption-bottom px-5 py-3 text-left text-[12.5px] text-ink-soft">
              Monthly billing, prices include GST. Yearly billing is cheaper; see /pricing.
            </caption>
            <thead>
              <tr className="bg-surface">
                {["Plan", "Price a month", "Clip Minutes a month", "Price per minute"].map((h) => (
                  <th key={h} scope="col" className="border-b border-card-border px-5 py-3 font-semibold text-ink">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {perMinute.map((p) => (
                <tr key={p.name} className="border-b border-card-border last:border-b-0">
                  <th scope="row" className="px-5 py-3 font-semibold text-ink">{p.name}</th>
                  <td className="px-5 py-3 text-ink-soft">₹{p.monthlyInr.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3 text-ink-soft">{p.minutes.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3 text-ink">{rupees(p.perMinute)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </MarketingShell>
  );
}
