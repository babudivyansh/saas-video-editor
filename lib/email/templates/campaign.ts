// Admin-built marketing campaigns (Admin → Campaigns, app/api/cron/email-campaigns).
//
// Turns the stored CampaignBlock[] (lib/campaigns/content.ts) into the shared
// email Block vocabulary. Everything an admin typed stays a plain string, so
// blocks.ts escapes it; the only markup added here is the literal <br/> between
// lines of a paragraph.

import type { EmailDocument } from "../layout";
import type { Block, Tone } from "../blocks";
import { html, type SafeHtml } from "../html";
import { greet } from "../format";
import { APP_URL } from "../tokens";
import { NAME_TOKEN, type CampaignBlock } from "@/lib/campaigns/content";

export interface CampaignEmailProps {
  name: string;
  subject: string;
  preheader: string;
  blocks: CampaignBlock[];
  /** utm_campaign for links to our own site. */
  utmCampaign: string;
}

const APP_HOST = (() => {
  try {
    return new URL(APP_URL).hostname;
  } catch {
    return "clipiro.com";
  }
})();

/**
 * Tag links to our own site so a sale's clicks and sign-ups show up against
 * the campaign. Other sites' links are left exactly as typed, and an existing
 * utm_campaign is never overwritten.
 */
export function withUtm(href: string, utmCampaign: string): string {
  let url: URL;
  try {
    url = href.startsWith("/") ? new URL(href, APP_URL) : new URL(href);
  } catch {
    return href;
  }
  const own = url.hostname === APP_HOST || url.hostname.endsWith(`.${APP_HOST}`);
  if (!own || url.searchParams.has("utm_campaign")) return href.startsWith("/") ? url.toString() : href;
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "campaign");
  url.searchParams.set("utm_campaign", utmCampaign);
  return url.toString();
}

function personalise(text: string, name: string): string {
  return text.split(NAME_TOKEN).join(greet(name));
}

/** One stored paragraph → one email paragraph per blank-line-separated chunk. */
function paragraphs(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split(/\n/);
      const joined = lines.slice(1).reduce<SafeHtml>((acc, line) => html`${acc}<br/>${line}`, html`${lines[0]}`);
      return { kind: "paragraph", text: joined } as Block;
    });
}

const TONE: Record<"brand" | "success" | "warning" | "neutral", Tone> = {
  brand: "brand",
  success: "success",
  warning: "warning",
  neutral: "neutral",
};

export function toEmailBlocks(blocks: CampaignBlock[], name: string, utmCampaign: string): Block[] {
  let headings = 0;
  return blocks.flatMap((b): Block[] => {
    switch (b.kind) {
      case "heading":
        headings++;
        return [{ kind: "heading", text: personalise(b.text, name), level: headings === 1 ? 1 : 2 }];
      case "paragraph":
        return paragraphs(personalise(b.text, name));
      case "button":
        return [{ kind: "button", label: b.label, href: withUtm(b.href, utmCampaign) }];
      case "image":
        return [{ kind: "image", src: b.src, alt: b.alt, ...(b.href ? { href: withUtm(b.href, utmCampaign) } : {}) }];
      case "offer":
        return [{ kind: "hero", label: b.label, value: b.price, was: b.was || undefined, caption: b.caption || undefined, tone: "brand" }];
      case "coupon":
        return [{ kind: "coupon", code: b.code, caption: b.caption || undefined }];
      case "callout":
        return [{ kind: "callout", tone: TONE[b.tone], title: b.title || undefined, body: personalise(b.body, name) }];
      case "list":
        return [{ kind: "list", items: b.items, marker: "check" }];
      case "divider":
        return [{ kind: "divider" }];
      case "spacer":
        return [{ kind: "spacer", size: "md" }];
      // Stored content is validated on write, but an unknown kind must drop
      // out rather than reach the renderer as undefined.
      default:
        return [];
    }
  });
}

export function campaign(p: CampaignEmailProps): EmailDocument {
  return {
    subject: personalise(p.subject, p.name),
    preheader: personalise(p.preheader, p.name),
    blocks: toEmailBlocks(p.blocks, p.name, p.utmCampaign),
  };
}
