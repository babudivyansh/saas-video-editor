import { BLOG_POSTS } from "@/app/blog/posts";
import { ALL_TOOLS, CATEGORY_LABELS } from "@/app/components/featureLinks";
import { HOME_FAQS } from "@/app/components/landing/faqs";
import { HELP_ARTICLES } from "@/app/help/articles";
import { getToolContent } from "@/app/tools/content";
import { GTA6_CONTENT } from "@/app/gta-6-clip-maker/content";
import { COMPETITORS } from "@/app/compare/data";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, TIER_LABEL, PURCHASABLE_TIER_ORDER } from "@/lib/plans/tiers";

// /llms.txt (llmstxt.org): a plain-Markdown map of the public site for AI
// answer engines. Built from the same registries as the sitemap and the tool
// pages, so a new tool, help article or post shows up here without an edit.
// Plan prices are deliberately left to /pricing — they are DB rows, and a
// stale number quoted by an assistant is worse than a link.
export const dynamic = "force-static";

const BASE = "https://clipiro.com";

export function GET() {
  const plans = PURCHASABLE_TIER_ORDER.map((t) => TIER_LABEL[t]).join(", ");

  const tools = ALL_TOOLS.map((tool) => {
    const content = getToolContent(tool.slug);
    const label = CATEGORY_LABELS[tool.category];
    return `- [${tool.title}](${BASE}/tools/${tool.slug}): ${content?.metaDescription ?? tool.desc} (${label})`;
  });

  const lines = [
    "# Clipiro",
    "",
    "> Clipiro is a browser-based AI video tool for creators. Its main product, AutoClip, turns long videos (podcasts, interviews, streams, webinars) into short vertical clips with captions for YouTube Shorts, Instagram Reels and Facebook. Around it sit AI tools (image generation, voiceover, voice changing, speech enhancement, background and subtitle removal) and free utilities.",
    "",
    `- Plans: Free, ${plans}. The free plan needs no card and includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked AutoClip minutes a month.`,
    "- AutoClip is billed in Clip Minutes: one minute per minute of source video, however many clips it produces.",
    "- Other AI tools spend credits from one shared balance; the free utilities spend nothing.",
    "- Every paid plan includes a commercial license and exports without a watermark.",
    `- Current prices: ${BASE}/pricing`,
    "",
    "## Tools",
    "",
    ...tools,
    "",
    "## Use cases",
    "",
    `- [GTA 6 clip maker](${BASE}/gta-6-clip-maker): ${GTA6_CONTENT.metaDescription}`,
    "",
    "## Frequently asked questions",
    "",
    ...HOME_FAQS.map((f) => `- **${f.q}** ${f.a}`),
    "",
    "## Caption templates",
    "",
    `- [All ${CAPTION_TEMPLATES.length} caption templates](${BASE}/caption-templates): every template, previewed live`,
    ...CAPTION_FAMILIES.filter((f) => CAPTION_TEMPLATES.some((t) => t.family === f.id)).map(
      (f) => `- [${f.name}](${BASE}/caption-templates/${f.id}): ${f.description}`,
    ),
    "",
    "## Comparisons",
    "",
    ...COMPETITORS.map((c) => `- [${c.name} vs Clipiro](${BASE}/compare/${c.slug}): ${c.summary}`),
    "",
    "## Help",
    "",
    ...HELP_ARTICLES.map((a) => `- [${a.title}](${BASE}/help/${a.slug}): ${a.metaDescription}`),
    "",
    "## Blog",
    "",
    ...BLOG_POSTS.map((p) => `- [${p.title}](${BASE}/blog/${p.slug}): ${p.metaDescription}`),
    "",
    "## Company",
    "",
    `- [About](${BASE}/about)`,
    `- [Pricing](${BASE}/pricing)`,
    `- [Customer reviews](${BASE}/reviews)`,
    `- [Contact](${BASE}/contact)`,
    `- [Legal](${BASE}/legal)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
