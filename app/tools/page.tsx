import type { Metadata } from "next";
import { buildBreadcrumbSchema, buildCollectionPageSchema } from "@/app/blog/schema";
import { JsonLd } from "@/app/components/JsonLd";
import CardGrid from "@/app/components/marketing/CardGrid";
import LinkCard from "@/app/components/marketing/LinkCard";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import Section from "@/app/components/marketing/Section";
import { Button } from "@/app/components/ui/Button";
import { ALL_TOOLS, AI_TOOLS, FREE_FEATURES, VIDEO_TOOLS, toolPath } from "@/app/components/featureLinks";

const DESCRIPTION = `Every tool in the Clipiro workspace — ${ALL_TOOLS.length} of them, sharing one plan and one credit balance.`;

export const metadata: Metadata = {
  title: "All Tools",
  description:
    "Browse every Clipiro tool: AutoClip, the video editor, AI voiceovers, image and video generation, face swap, background removal, and free compressors and downloaders.",
  alternates: { canonical: "/tools" },
};

const GROUPS = [
  {
    id: "video-tools",
    title: "Video Tools",
    lede: "Workflows that turn raw footage — or nothing at all — into something postable.",
    tools: VIDEO_TOOLS,
  },
  {
    id: "ai-tools",
    title: "AI Tools",
    lede: "Single-purpose generators and enhancers. Every model shares your one credit balance.",
    tools: AI_TOOLS,
  },
  {
    id: "free-tools",
    title: "Free Tools",
    lede: "No credits, no watermark, on every plan including the free one.",
    tools: FREE_FEATURES,
  },
];

export default function ToolsIndexPage() {
  const schema = [
    buildCollectionPageSchema({ name: "Clipiro tools", description: DESCRIPTION, path: "/tools" }),
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
    ]),
  ];

  return (
    <MarketingShell>
      <JsonLd data={schema} />

      <PageHero
        eyebrow="Tools"
        title={`${ALL_TOOLS.length} tools, one workspace`}
        lede={`${DESCRIPTION} Clip long videos, generate voiceovers and imagery, edit on a real timeline, and compress or convert whatever you need along the way.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button href="/register" size="lg">
            Start free
          </Button>
          <Button href="/pricing" variant="secondary" size="lg">
            See pricing
          </Button>
        </div>
      </PageHero>

      {GROUPS.map((group, i) => (
        <Section
          key={group.id}
          id={group.id}
          eyebrow={`${group.tools.length} tools`}
          title={group.title}
          lede={group.lede}
          // The hero already draws a border-b, so the first group must not add
          // its own or the two stack into a double rule.
          className={i === 0 ? "" : `border-t border-card-border ${i % 2 === 1 ? "bg-surface" : ""}`}
        >
          <CardGrid>
            {group.tools.map((tool) => (
              <LinkCard
                key={tool.slug}
                href={toolPath(tool)}
                title={tool.title}
                description={tool.desc}
                cta="Learn more"
              />
            ))}
          </CardGrid>
        </Section>
      ))}
    </MarketingShell>
  );
}
